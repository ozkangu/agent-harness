"""Async poll loop, state machine, dispatch, and retry logic."""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from maestro.board import Board
from maestro.config import WorkflowLoader, render_prompt
from maestro.models import Issue, IssueStatus, MaestroConfig, PipelinePhase
from maestro.runner import RunResult, create_runner
from maestro.runner_pool import RunnerPool
from maestro.workspace import Workspace

logger = logging.getLogger(__name__)


@dataclass
class ActiveRun:
    """Tracks a currently running agent."""

    issue: Issue
    workspace: Workspace
    task: asyncio.Task
    started_at: float = 0.0


class Orchestrator:
    """Main orchestration loop: polls the board, dispatches agents, handles results."""

    def __init__(
        self,
        board: Board,
        workflow_loader: WorkflowLoader,
        on_issue_completed: Callable[[str, IssueStatus], Awaitable[None]] | None = None,
        notify: Callable[[str, dict], Awaitable[None]] | None = None,
        quality_gate=None,
        context_engine=None,
        runner_pool: RunnerPool | None = None,
    ) -> None:
        self.board = board
        self.workflow_loader = workflow_loader
        self.on_issue_completed = on_issue_completed
        self._notify = notify or _noop_notify
        self._quality_gate = quality_gate
        self._context_engine = context_engine
        self._runner_pool = runner_pool
        self._active_runs: dict[str, ActiveRun] = {}
        self._shutdown = False
        self._poll_interval = 10.0  # seconds

    @property
    def config(self) -> MaestroConfig:
        return self.workflow_loader.load()

    async def start(self) -> None:
        """Start the orchestration poll loop."""
        logger.info("Orchestrator started")
        self._shutdown = False

        try:
            while not self._shutdown:
                await self._tick()
                await asyncio.sleep(self._poll_interval)
        except asyncio.CancelledError:
            logger.info("Orchestrator cancelled")
        finally:
            await self._shutdown_all()

    async def stop(self) -> None:
        """Signal the orchestrator to stop."""
        logger.info("Orchestrator stopping")
        self._shutdown = True
        await self._shutdown_all()

    async def _tick(self) -> None:
        """Single poll cycle."""
        try:
            cfg = self.config

            # Check completed runs
            completed_keys = []
            for key, run in self._active_runs.items():
                if run.task.done():
                    completed_keys.append(key)

            for key in completed_keys:
                run = self._active_runs.pop(key)
                await self._handle_completion(run)

            # Dispatch new work if under concurrency limit
            available_slots = cfg.orchestrator.max_concurrent_agents - len(self._active_runs)
            if available_slots > 0:
                todo_issues = await self.board.get_issues(status=IssueStatus.TODO)
                dispatched = 0
                for issue in todo_issues:
                    if dispatched >= available_slots:
                        break
                    if await self._should_dispatch(issue, cfg):
                        await self._dispatch(issue, cfg)
                        dispatched += 1

        except Exception:
            logger.exception("Error in orchestrator tick")

    async def _should_dispatch(self, issue: Issue, cfg: MaestroConfig) -> bool:
        """Check if an issue should be dispatched (backoff, retry limits)."""
        if issue.attempt_count >= cfg.orchestrator.max_retries:
            return False

        if issue.depends_on:
            unmet = []
            for dep_key in issue.depends_on:
                dep_issue = await self.board.get_issue(dep_key)
                if dep_issue is None or dep_issue.status not in (IssueStatus.REVIEW, IssueStatus.DONE):
                    unmet.append(dep_key)
            if unmet:
                reason = f"Waiting for dependencies: {', '.join(unmet)}"
                if issue.blocked_reason != reason:
                    await self.board.update_issue(issue.key, blocked_reason=reason)
                return False

            if issue.blocked_reason:
                await self.board.update_issue(issue.key, blocked_reason=None)

        # Check backoff: simple exponential with jitter
        if issue.attempt_count > 0:
            backoff = min(
                cfg.orchestrator.backoff_base_seconds * (2 ** (issue.attempt_count - 1)),
                cfg.orchestrator.backoff_max_seconds,
            )
            # Add ±10% jitter
            jitter = backoff * 0.1 * (2 * random.random() - 1)  # noqa: S311
            backoff += jitter

            # Check if enough time has passed since last update
            import time
            from datetime import datetime, timezone

            now = datetime.now(timezone.utc)
            elapsed = (now - issue.updated_at).total_seconds()
            if elapsed < backoff:
                logger.debug(
                    "Issue %s in backoff (%.0fs remaining)",
                    issue.key,
                    backoff - elapsed,
                )
                return False

        return True

    async def _dispatch(self, issue: Issue, cfg: MaestroConfig) -> None:
        """Dispatch an agent to work on an issue."""
        logger.info("Dispatching agent for %s: %s", issue.key, issue.title)

        await self.board.update_status(issue.key, IssueStatus.WORKING)
        issue = await self.board.get_issue(issue.key)  # type: ignore[assignment]
        assert issue is not None

        await self.board.update_issue(
            issue.key, attempt_count=issue.attempt_count + 1
        )

        workspace = Workspace(
            issue=issue,
            repo_url=cfg.orchestrator.repo_url,
            default_branch=cfg.orchestrator.default_branch,
            hooks=cfg.orchestrator.hooks,
        )

        task = asyncio.create_task(
            self._run_agent(issue, workspace, cfg),
            name=f"agent-{issue.key}",
        )

        import time as _time

        self._active_runs[issue.key] = ActiveRun(
            issue=issue,
            workspace=workspace,
            task=task,
            started_at=_time.monotonic(),
        )

        await self.board.log_activity(
            issue.key, "dispatched", f"Attempt {issue.attempt_count + 1}"
        )

    def _make_output_callback(self, issue_key: str):
        """Create an async callback that broadcasts runner output with issue_key prefix."""
        async def _on_output(parsed: dict) -> None:
            content = self._extract_display_content(parsed)
            if content:
                await self._notify("runner_output", {
                    "issue_key": issue_key,
                    "type": parsed.get("type", "raw"),
                    "content": content,
                })
        return _on_output

    @staticmethod
    def _extract_display_content(parsed: dict) -> str:
        """Extract readable text from a JSONL line."""
        if parsed.get("type") == "assistant":
            msg = parsed.get("message", {})
            if isinstance(msg, dict):
                return msg.get("content", "")
            return str(msg) if msg else ""
        if parsed.get("type") == "result":
            return parsed.get("result", parsed.get("content", ""))
        if parsed.get("type") == "tool":
            name = parsed.get("name", "")
            content = parsed.get("content", "")
            return f"[tool] {name}: {content}" if name else content
        if parsed.get("content"):
            return parsed["content"]
        return ""

    async def _run_agent(
        self, issue: Issue, workspace: Workspace, cfg: MaestroConfig
    ) -> RunResult:
        """Full agent execution: workspace setup, context enrichment, run, quality check, cleanup."""
        try:
            # Create workspace
            workdir = await workspace.create()
            await self.board.update_issue(issue.key, branch_name=workspace.branch_name)

            # Pre-run hook
            await workspace.pre_run()

            # Build enriched context if context engine available
            context = ""
            if self._context_engine:
                try:
                    context = await self._context_engine.build_context(issue=issue)
                except Exception:
                    logger.debug("Context building failed for %s, continuing without", issue.key)

            # Render prompt with context
            prompt = render_prompt(cfg, issue, context=context)

            # Run agent - use runner pool if available, else create from config
            if self._runner_pool:
                runner = self._runner_pool.get_runner_for_phase(PipelinePhase.CODING)
            else:
                runner = create_runner(cfg.copilot)
            result = await runner.run(
                prompt=prompt,
                session_id=issue.session_id,
                workdir=str(workdir),
                stall_timeout=cfg.orchestrator.stall_timeout_seconds,
                turn_timeout=cfg.orchestrator.turn_timeout_seconds,
                on_output=self._make_output_callback(issue.key),
            )

            # Capture session_id for potential --continue
            if result.session_id:
                await self.board.update_issue(issue.key, session_id=result.session_id)

            # Post-run hook
            if result.success:
                hook_ok = await workspace.post_run()
                if not hook_ok:
                    result.success = False
                    result.error = "Post-run hook failed"

            # Quality gate check after successful agent run
            if result.success and self._quality_gate:
                try:
                    qr = await self._quality_gate.run_checks(
                        str(workdir),
                        issue_key=issue.key,
                        triggered_by="agent_action",
                    )
                    if not qr.passed:
                        result.success = False
                        result.error = f"Quality gate failed: {qr.summary}"
                        logger.warning("Quality gate failed for %s: %s", issue.key, qr.summary)
                except Exception:
                    logger.exception("Quality gate error for %s", issue.key)

            return result

        except Exception as exc:
            logger.exception("Agent run failed for %s", issue.key)
            return RunResult(success=False, error=str(exc))

        finally:
            await workspace.cleanup()

    async def _handle_completion(self, run: ActiveRun) -> None:
        """Handle a completed agent run."""
        try:
            result: RunResult = run.task.result()
        except Exception as exc:
            result = RunResult(success=False, error=str(exc))

        issue_key = run.issue.key
        new_status: IssueStatus

        if result.success:
            logger.info("Agent succeeded for %s", issue_key)
            new_status = IssueStatus.REVIEW
            await self.board.update_status(issue_key, new_status)
            await self.board.log_activity(issue_key, "completed", "Agent finished successfully")
        else:
            cfg = self.config
            issue = await self.board.get_issue(issue_key)
            assert issue is not None

            error_msg = result.error or "Unknown error"
            await self.board.update_issue(issue_key, error_log=error_msg)

            if issue.attempt_count >= cfg.orchestrator.max_retries:
                logger.error("Max retries reached for %s", issue_key)
                new_status = IssueStatus.FAILED
                await self.board.update_status(issue_key, new_status)
                await self.board.log_activity(
                    issue_key, "failed", f"Max retries reached. Last error: {error_msg}"
                )
            else:
                logger.warning("Retrying %s (attempt %d)", issue_key, issue.attempt_count)
                new_status = IssueStatus.TODO
                await self.board.update_status(issue_key, new_status)
                await self.board.log_activity(
                    issue_key, "retrying", f"Error: {error_msg}"
                )

        # Broadcast status change via WebSocket
        updated_issue = await self.board.get_issue(issue_key)
        if updated_issue is not None:
            await self._notify("issue_updated", updated_issue.to_dict())

        # Notify pipeline manager about completion
        if self.on_issue_completed is not None:
            try:
                await self.on_issue_completed(issue_key, new_status)
            except Exception:
                logger.exception("on_issue_completed callback failed for %s", issue_key)

    async def _shutdown_all(self) -> None:
        """Cancel all active runs and clean up."""
        for key, run in list(self._active_runs.items()):
            logger.info("Cancelling agent for %s", key)
            run.task.cancel()
            try:
                await run.task
            except (asyncio.CancelledError, Exception):
                pass
            await run.workspace.cleanup()
        self._active_runs.clear()

    async def manual_retry(self, key: str) -> None:
        """Manually retry a failed or todo issue."""
        issue = await self.board.get_issue(key)
        if issue is None:
            raise ValueError(f"Issue {key} not found")

        if issue.status == IssueStatus.FAILED:
            await self.board.update_issue(key, attempt_count=0, error_log=None)
            await self.board.update_status(key, IssueStatus.TODO)
            await self.board.log_activity(key, "manual_retry", "Manual retry triggered")
        elif issue.status == IssueStatus.REVIEW:
            await self.board.update_status(key, IssueStatus.TODO)
            await self.board.log_activity(key, "manual_retry", "Sent back from review")
        else:
            raise ValueError(f"Cannot retry issue in status: {issue.status.value}")


async def _noop_notify(event: str, data: dict) -> None:
    """No-op notification handler."""
    pass
