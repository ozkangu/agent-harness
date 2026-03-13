"""CLI entry point for Maestro."""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
from pathlib import Path

import click
import uvicorn
from rich.console import Console
from rich.table import Table

from maestro.board import Board
from maestro.chat import ChatStore
from maestro.config import WorkflowLoader
from maestro.constants import (
    DEFAULT_DB_PATH,
    DEFAULT_ISSUES_DIR,
    DEFAULT_WEB_PORT,
    WORKFLOW_FILE,
)
from maestro.context import ContextEngine
from maestro.conversation import ConversationManager
from maestro.entropy import EntropyManager
from maestro.models import IssueStatus
from maestro.orchestrator import Orchestrator
from maestro.pipeline import PipelineManager
from maestro.planner import PlannerAgent
from maestro.quality import QualityGate
from maestro.models import BackendType
from maestro.runner import create_runner
from maestro.watcher import IssueWatcher
from maestro.web import create_app

logger = logging.getLogger(__name__)
console = Console()


def setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable debug logging")
@click.option("--db", default=DEFAULT_DB_PATH, help="SQLite database path")
@click.pass_context
def main(ctx: click.Context, verbose: bool, db: str) -> None:
    """Maestro - Autonomous coding agent orchestrator."""
    setup_logging(verbose)
    ctx.ensure_object(dict)
    ctx.obj["db_path"] = db
    ctx.obj["verbose"] = verbose


@main.command()
@click.option("--no-web", is_flag=True, help="Disable web UI")
@click.option("--port", default=DEFAULT_WEB_PORT, help="Web UI port")
@click.option("--workflow", default=WORKFLOW_FILE, help="Workflow config file")
@click.pass_context
def start(ctx: click.Context, no_web: bool, port: int, workflow: str) -> None:
    """Start the orchestrator and web UI."""
    db_path = ctx.obj["db_path"]

    if not Path(workflow).exists():
        console.print(f"[red]Workflow file not found: {workflow}[/red]")
        console.print("Create a WORKFLOW.md file or copy from WORKFLOW.example.md")
        sys.exit(1)

    asyncio.run(_start_async(db_path, workflow, port, no_web))


async def _start_async(db_path: str, workflow: str, port: int, no_web: bool) -> None:
    """Async startup: board, orchestrator, watcher, pipeline, web server."""
    board = Board(db_path)
    await board.connect()

    loader = WorkflowLoader(workflow)
    cfg = loader.load()

    # Pipeline components
    chat_store = ChatStore(board.db)
    runner = create_runner(cfg.copilot)
    planner = PlannerAgent(runner, board, chat_store)

    # New: Context engine, quality gate, entropy manager
    repo_dir = cfg.orchestrator.repo_url or "."
    context_engine = ContextEngine(chat_store, repo_dir=repo_dir)
    quality_gate = QualityGate(chat_store, board.db)
    entropy_manager = EntropyManager(
        runner=runner,
        context_engine=context_engine,
        quality_gate=quality_gate,
        chat_store=chat_store,
        board=board,
        workdir=repo_dir,
        db=board.db,
    )

    pipeline_manager = PipelineManager(
        chat_store, board, planner,
        auto_approve=cfg.orchestrator.auto_approve,
        max_inner_iterations=cfg.orchestrator.max_inner_iterations,
    )
    await pipeline_manager.resume_incomplete_pipelines()

    # New: Conversation manager
    conversation_manager = ConversationManager(
        chat_store, board, runner, context_engine, pipeline_manager,
    )

    # Orchestrator wired with pipeline callback and new components
    orchestrator = Orchestrator(
        board, loader,
        on_issue_completed=pipeline_manager.notify_issue_completed,
        quality_gate=quality_gate,
        context_engine=context_engine,
    )
    watcher = IssueWatcher(board, cfg.orchestrator.issues_dir)

    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    def _signal_handler() -> None:
        console.print("\n[yellow]Shutting down...[/yellow]")
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _signal_handler)

    # Start watcher
    watcher.start(loop)

    tasks: list[asyncio.Task] = []
    tasks.append(asyncio.create_task(orchestrator.start(), name="orchestrator"))

    if not no_web:
        async def _on_backend_changed(backend: BackendType, model: str) -> None:
            new_cfg = loader.load()
            planner.runner = create_runner(new_cfg.copilot)
            logger.info("Backend changed to %s (model=%s)", backend.value, model or "default")

        app, notify = create_app(
            board,
            chat_store=chat_store,
            pipeline_manager=pipeline_manager,
            conversation_manager=conversation_manager,
            context_engine=context_engine,
            quality_gate=quality_gate,
            entropy_manager=entropy_manager,
            workflow_loader=loader,
            on_backend_changed=_on_backend_changed,
        )
        # Wire the WebSocket notify callback to pipeline_manager, orchestrator, and conversation_manager
        pipeline_manager._notify = notify
        orchestrator._notify = notify
        conversation_manager._notify = notify

        # Wire planner on_output to broadcast runner_output events
        async def _planner_on_output(parsed: dict) -> None:
            content = parsed.get("content", "")
            if not content and parsed.get("type") == "assistant":
                msg = parsed.get("message", {})
                content = msg.get("content", "") if isinstance(msg, dict) else str(msg)
            if not content and parsed.get("type") == "result":
                content = parsed.get("result", "")
            if content:
                await notify("runner_output", {
                    "type": parsed.get("type", "raw"),
                    "content": content,
                })
        planner.on_output = _planner_on_output
        config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
        server = uvicorn.Server(config)
        tasks.append(asyncio.create_task(server.serve(), name="web-server"))
        console.print(f"[green]Kanban board: http://localhost:{port}[/green]")

    console.print("[green]Maestro started. Press Ctrl+C to stop.[/green]")

    # Wait for shutdown signal
    await shutdown_event.wait()

    # Graceful shutdown
    await orchestrator.stop()
    watcher.stop()

    for task in tasks:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    await board.close()
    console.print("[green]Maestro stopped.[/green]")


@main.command()
@click.argument("title")
@click.option("--description", "-d", default="", help="Issue description")
@click.option(
    "--priority", "-p", type=click.Choice(["high", "medium", "low"]), default="medium"
)
@click.option("--labels", "-l", multiple=True, help="Issue labels")
@click.pass_context
def create(
    ctx: click.Context, title: str, description: str, priority: str, labels: tuple[str, ...]
) -> None:
    """Create a new issue."""
    db_path = ctx.obj["db_path"]
    asyncio.run(_create_issue(db_path, title, description, priority, list(labels)))


async def _create_issue(
    db_path: str, title: str, description: str, priority: str, labels: list[str]
) -> None:
    board = Board(db_path)
    await board.connect()
    try:
        issue = await board.create_issue(title, description, priority, labels)
        console.print(f"[green]Created {issue.key}: {issue.title}[/green]")
    finally:
        await board.close()


@main.command("list")
@click.option("--status", "-s", type=click.Choice([s.value for s in IssueStatus]), default=None)
@click.pass_context
def list_issues(ctx: click.Context, status: str | None) -> None:
    """List all issues."""
    db_path = ctx.obj["db_path"]
    asyncio.run(_list_issues(db_path, status))


async def _list_issues(db_path: str, status: str | None) -> None:
    board = Board(db_path)
    await board.connect()
    try:
        s = IssueStatus(status) if status else None
        issues = await board.get_issues(status=s)

        if not issues:
            console.print("[dim]No issues found.[/dim]")
            return

        table = Table(title="Issues")
        table.add_column("Key", style="cyan")
        table.add_column("Title")
        table.add_column("Status", style="bold")
        table.add_column("Priority")
        table.add_column("Attempts", justify="right")

        status_colors = {
            "todo": "white",
            "working": "yellow",
            "review": "blue",
            "done": "green",
            "failed": "red",
        }

        for issue in issues:
            color = status_colors.get(issue.status.value, "white")
            table.add_row(
                issue.key,
                issue.title,
                f"[{color}]{issue.status.value}[/{color}]",
                issue.priority,
                str(issue.attempt_count),
            )

        console.print(table)
    finally:
        await board.close()


@main.command()
@click.argument("key")
@click.pass_context
def show(ctx: click.Context, key: str) -> None:
    """Show issue details."""
    db_path = ctx.obj["db_path"]
    asyncio.run(_show_issue(db_path, key.upper()))


async def _show_issue(db_path: str, key: str) -> None:
    board = Board(db_path)
    await board.connect()
    try:
        issue = await board.get_issue(key)
        if issue is None:
            console.print(f"[red]Issue {key} not found[/red]")
            return

        console.print(f"\n[bold cyan]{issue.key}[/bold cyan] - {issue.title}")
        console.print(f"  Status:   {issue.status.value}")
        console.print(f"  Priority: {issue.priority}")
        console.print(f"  Labels:   {', '.join(issue.labels) or 'none'}")
        console.print(f"  Attempts: {issue.attempt_count}")
        if issue.branch_name:
            console.print(f"  Branch:   {issue.branch_name}")
        if issue.pr_url:
            console.print(f"  PR:       {issue.pr_url}")
        if issue.error_log:
            console.print(f"  [red]Error:    {issue.error_log}[/red]")

        console.print(f"\n  Description:\n  {issue.description or '(none)'}")

        activity = await board.get_activity(key)
        if activity:
            console.print("\n  [bold]Activity Log:[/bold]")
            for entry in activity:
                console.print(
                    f"    {entry.timestamp:%H:%M:%S} [{entry.event}] {entry.details}"
                )
    finally:
        await board.close()


@main.command()
@click.argument("key")
@click.pass_context
def retry(ctx: click.Context, key: str) -> None:
    """Manually retry a failed issue."""
    db_path = ctx.obj["db_path"]
    asyncio.run(_retry_issue(db_path, key.upper()))


async def _retry_issue(db_path: str, key: str) -> None:
    board = Board(db_path)
    await board.connect()
    try:
        issue = await board.get_issue(key)
        if issue is None:
            console.print(f"[red]Issue {key} not found[/red]")
            return

        if issue.status == IssueStatus.FAILED:
            await board.update_issue(key, attempt_count=0, error_log=None)
            await board.update_status(key, IssueStatus.TODO)
            await board.log_activity(key, "manual_retry", "Manual retry triggered via CLI")
            console.print(f"[green]{key} reset to todo for retry[/green]")
        elif issue.status == IssueStatus.REVIEW:
            await board.update_status(key, IssueStatus.TODO)
            await board.log_activity(key, "manual_retry", "Sent back from review via CLI")
            console.print(f"[green]{key} sent back to todo from review[/green]")
        else:
            console.print(f"[red]Cannot retry issue in status: {issue.status.value}[/red]")
    finally:
        await board.close()


if __name__ == "__main__":
    main()
