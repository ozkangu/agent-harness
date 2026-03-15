"""ASGI entry point for production deployment with uvicorn.

Usage:
    uvicorn cortex.asgi:app --host 0.0.0.0 --port 8420

Environment variables:
    CORTEX_DB_PATH       -- SQLite database path (default: cortex.db)
    CORTEX_WORKFLOW      -- Workflow config file (default: WORKFLOW.md)
    CORTEX_AUTH_ENABLED  -- Enable JWT auth (default: false)
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path

from starlette.types import ASGIApp, Receive, Scope, Send

from cortex.board import Board
from cortex.chat import ChatStore
from cortex.config import WorkflowLoader
from cortex.constants import DEFAULT_DB_PATH, WORKFLOW_FILE
from cortex.context import ContextEngine
from cortex.conversation import ConversationManager
from cortex.entropy import EntropyManager
from cortex.models import BackendType
from cortex.orchestrator import Orchestrator
from cortex.pipeline import PipelineManager
from cortex.planner import PlannerAgent
from cortex.quality import QualityGate
from cortex.runner_pool import RunnerPool
from cortex.watcher import IssueWatcher
from cortex.web import create_app
from cortex.mcp_server import create_mcp_server
from cortex.mcp_client import MCPClientManager
from cortex.auth import AuthManager
from cortex.audit import AuditLogger
from cortex.secrets import SecretManager
from cortex.policy import PolicyEngine

logger = logging.getLogger(__name__)


class CortexApp:
    """ASGI application that initialises all Cortex services on startup.

    Implements the raw ASGI protocol so it can handle the lifespan
    handshake itself, then delegates every HTTP / WebSocket request
    to the inner FastAPI app built by :func:`cortex.web.create_app`.
    """

    def __init__(self) -> None:
        self._inner: ASGIApp | None = None
        self._board: Board | None = None
        self._orchestrator: Orchestrator | None = None
        self._watcher: IssueWatcher | None = None
        self._bg_tasks: list[asyncio.Task] = []

    # ------------------------------------------------------------------
    # ASGI interface
    # ------------------------------------------------------------------

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan":
            await self._handle_lifespan(scope, receive, send)
        elif self._inner is not None:
            await self._inner(scope, receive, send)

    async def _handle_lifespan(
        self, scope: Scope, receive: Receive, send: Send,
    ) -> None:
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                try:
                    await self._startup()
                    await send({"type": "lifespan.startup.complete"})
                except Exception as exc:
                    logger.exception("Startup failed")
                    await send({
                        "type": "lifespan.startup.failed",
                        "message": str(exc),
                    })
                    return
            elif message["type"] == "lifespan.shutdown":
                await self._shutdown()
                await send({"type": "lifespan.shutdown.complete"})
                return

    # ------------------------------------------------------------------
    # Startup – mirrors cortex.main._start_async
    # ------------------------------------------------------------------

    async def _startup(self) -> None:
        db_path = os.environ.get("CORTEX_DB_PATH", DEFAULT_DB_PATH)
        workflow = os.environ.get("CORTEX_WORKFLOW", WORKFLOW_FILE)

        # Ensure workflow file exists
        wf = Path(workflow)
        if not wf.exists():
            example = Path("WORKFLOW.example.md")
            if example.exists():
                shutil.copy(example, wf)
                logger.info("Copied WORKFLOW.example.md -> %s", workflow)
            else:
                raise FileNotFoundError(f"Workflow file not found: {workflow}")

        board = Board(db_path)
        await board.connect()
        self._board = board

        loader = WorkflowLoader(workflow)
        cfg = loader.load()

        # Runner pool with per-phase backend selection
        runner_pool = RunnerPool(cfg.copilot)
        for _phase, override in cfg.phase_backends.items():
            runner_pool.set_phase_override(override)

        chat_store = ChatStore(board.db)
        planner = PlannerAgent(runner_pool, board, chat_store)

        # MCP client
        mcp_client = MCPClientManager(board.db)
        await mcp_client.initialize()

        repo_dir = cfg.orchestrator.repo_url or "."
        context_engine = ContextEngine(
            chat_store, repo_dir=repo_dir, mcp_client=mcp_client,
        )

        mcp_server = create_mcp_server(context_engine, chat_store)

        # Enterprise security
        auth_enabled = os.environ.get(
            "CORTEX_AUTH_ENABLED", "false",
        ).lower() in ("true", "1", "yes")
        auth_manager = AuthManager(board.db, enabled=auth_enabled)
        await auth_manager.initialize()

        audit_logger = AuditLogger(board.db)
        await audit_logger.initialize()

        secret_manager = SecretManager(board.db)
        await secret_manager.initialize()

        policy_engine = PolicyEngine(board.db, repo_dir=repo_dir)
        await policy_engine.initialize()

        quality_gate = QualityGate(chat_store, board.db)
        entropy_manager = EntropyManager(
            runner=runner_pool.default_runner,
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

        conversation_manager = ConversationManager(
            chat_store, board, runner_pool, context_engine, pipeline_manager,
        )

        orchestrator = Orchestrator(
            board, loader,
            on_issue_completed=pipeline_manager.notify_issue_completed,
            quality_gate=quality_gate,
            context_engine=context_engine,
            runner_pool=runner_pool,
        )
        self._orchestrator = orchestrator

        watcher = IssueWatcher(board, cfg.orchestrator.issues_dir)
        self._watcher = watcher

        async def _on_backend_changed(backend: BackendType, model: str) -> None:
            new_cfg = loader.load()
            runner_pool.update_default(new_cfg.copilot)
            logger.info(
                "Backend changed to %s (model=%s)", backend.value, model or "default",
            )

        fastapi_app, notify = create_app(
            board,
            chat_store=chat_store,
            pipeline_manager=pipeline_manager,
            conversation_manager=conversation_manager,
            context_engine=context_engine,
            quality_gate=quality_gate,
            entropy_manager=entropy_manager,
            workflow_loader=loader,
            on_backend_changed=_on_backend_changed,
            runner_pool=runner_pool,
            mcp_client=mcp_client,
            mcp_server=mcp_server,
            auth_manager=auth_manager,
            audit_logger=audit_logger,
            secret_manager=secret_manager,
            policy_engine=policy_engine,
        )

        # Wire notify callbacks
        pipeline_manager._notify = notify
        orchestrator._notify = notify
        conversation_manager._notify = notify

        # Wire planner output to WebSocket broadcast
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

        # Start background services
        loop = asyncio.get_running_loop()
        watcher.start(loop)
        self._bg_tasks = [
            asyncio.create_task(orchestrator.start(), name="orchestrator"),
        ]

        # Build the middleware stack so the inner app is ready to serve
        self._inner = fastapi_app  # type: ignore[assignment]

        logger.info("Cortex started (pid=%d)", os.getpid())

    # ------------------------------------------------------------------
    # Shutdown
    # ------------------------------------------------------------------

    async def _shutdown(self) -> None:
        logger.info("Cortex shutting down...")

        if self._orchestrator is not None:
            await self._orchestrator.stop()

        if self._watcher is not None:
            self._watcher.stop()

        for task in self._bg_tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        if self._board is not None:
            await self._board.close()

        logger.info("Cortex stopped.")


# Module-level ASGI app – use with:
#   uvicorn cortex.asgi:app --host 0.0.0.0 --port 8420
app = CortexApp()
