"""FastAPI REST API + Kanban web UI with WebSocket support."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Awaitable
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from maestro.board import Board
from maestro.chat import ChatStore
from maestro.config import WorkflowLoader
from maestro.models import BackendType, IssueStatus
from maestro.pipeline import PipelineManager
from maestro.conversation import ConversationManager

NotifyCallback = Callable[[str, dict], Awaitable[None]]

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent.parent / "static"


class CreateIssueRequest(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    labels: list[str] = []


class UpdateIssueRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    labels: list[str] | None = None


class CreatePipelineRequest(BaseModel):
    requirement: str


class SendMessageRequest(BaseModel):
    text: str


class CreateConversationRequest(BaseModel):
    title: str = "New Chat"


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        dead: list[WebSocket] = []
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.active_connections.remove(conn)


OnBackendChanged = Callable[[BackendType, str], Awaitable[None]]


def create_app(
    board: Board,
    chat_store: ChatStore | None = None,
    pipeline_manager: PipelineManager | None = None,
    conversation_manager: ConversationManager | None = None,
    context_engine=None,
    quality_gate=None,
    entropy_manager=None,
    workflow_loader: WorkflowLoader | None = None,
    on_backend_changed: OnBackendChanged | None = None,
) -> tuple[FastAPI, NotifyCallback]:
    """Create the FastAPI application."""
    app = FastAPI(title="Maestro", version="0.1.0")

    # CORS for frontend dev server
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    ws_manager = ConnectionManager()

    # Mount static files
    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    async def _notify(event: str, data: dict) -> None:
        await ws_manager.broadcast({"type": event, "event": event, "data": data})

    @app.get("/api/health")
    async def health_check():
        """Health check endpoint for monitoring and frontend connectivity."""
        return {
            "status": "ok",
            "version": "0.2.0",
            "services": {
                "board": board is not None,
                "pipeline": pipeline_manager is not None,
                "chat": chat_store is not None,
                "context": context_engine is not None,
                "quality": quality_gate is not None,
            },
        }

    @app.get("/", response_class=HTMLResponse)
    async def index():
        board_html = STATIC_DIR / "board.html"
        if board_html.exists():
            return FileResponse(str(board_html))
        return HTMLResponse("<h1>Maestro</h1><p>Static files not found.</p>")

    # --- Issue endpoints ---

    @app.get("/api/issues")
    async def list_issues(status: str | None = None):
        if status:
            try:
                s = IssueStatus(status)
            except ValueError:
                raise HTTPException(400, f"Invalid status: {status}")
            issues = await board.get_issues(status=s)
        else:
            issues = await board.get_issues()
        return [issue.to_dict() for issue in issues]

    @app.get("/api/issues/{key}")
    async def get_issue(key: str):
        issue = await board.get_issue(key)
        if issue is None:
            raise HTTPException(404, f"Issue {key} not found")
        activity = await board.get_activity(key)
        data = issue.to_dict()
        data["activity"] = [a.to_dict() for a in activity]
        return data

    @app.post("/api/issues", status_code=201)
    async def create_issue(req: CreateIssueRequest):
        issue = await board.create_issue(
            title=req.title,
            description=req.description,
            priority=req.priority,
            labels=req.labels,
        )
        await _notify("issue_created", issue.to_dict())
        return issue.to_dict()

    @app.patch("/api/issues/{key}")
    async def update_issue(key: str, req: UpdateIssueRequest):
        issue = await board.get_issue(key)
        if issue is None:
            raise HTTPException(404, f"Issue {key} not found")

        fields = req.model_dump(exclude_none=True)
        if not fields:
            return issue.to_dict()

        try:
            if "status" in fields:
                new_status = IssueStatus(fields.pop("status"))
                issue = await board.update_status(key, new_status)
            if fields:
                issue = await board.update_issue(key, **fields)
        except ValueError as e:
            raise HTTPException(400, str(e))

        await _notify("issue_updated", issue.to_dict())
        return issue.to_dict()

    @app.delete("/api/issues/{key}", status_code=204)
    async def delete_issue(key: str):
        issue = await board.get_issue(key)
        if issue is None:
            raise HTTPException(404, f"Issue {key} not found")
        await board.delete_issue(key)
        await _notify("issue_deleted", {"key": key})

    @app.get("/api/issues/{key}/activity")
    async def get_activity(key: str):
        issue = await board.get_issue(key)
        if issue is None:
            raise HTTPException(404, f"Issue {key} not found")
        activity = await board.get_activity(key)
        return [a.to_dict() for a in activity]

    @app.get("/api/stats")
    async def get_stats():
        return await board.get_stats()

    # --- Pipeline endpoints ---

    @app.get("/api/pipelines")
    async def list_pipelines():
        if chat_store is None:
            raise HTTPException(501, "Pipeline feature not configured")
        pipelines = await chat_store.get_pipelines()
        return [p.to_dict() for p in pipelines]

    @app.post("/api/pipelines", status_code=201)
    async def create_pipeline(req: CreatePipelineRequest):
        if pipeline_manager is None:
            raise HTTPException(501, "Pipeline feature not configured")
        result = await pipeline_manager.start_pipeline(req.requirement)
        return result

    @app.get("/api/pipelines/{pipeline_id}")
    async def get_pipeline(pipeline_id: int):
        if chat_store is None:
            raise HTTPException(501, "Pipeline feature not configured")
        pipeline = await chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            raise HTTPException(404, f"Pipeline {pipeline_id} not found")
        return pipeline.to_dict()

    @app.get("/api/pipelines/{pipeline_id}/messages")
    async def get_pipeline_messages(pipeline_id: int):
        if chat_store is None:
            raise HTTPException(501, "Pipeline feature not configured")
        pipeline = await chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            raise HTTPException(404, f"Pipeline {pipeline_id} not found")
        messages = await chat_store.get_messages(pipeline_id)
        return [m.to_dict() for m in messages]

    @app.post("/api/pipelines/{pipeline_id}/messages", status_code=201)
    async def send_pipeline_message(pipeline_id: int, req: SendMessageRequest):
        if pipeline_manager is None:
            raise HTTPException(501, "Pipeline feature not configured")
        pipeline = await chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            raise HTTPException(404, f"Pipeline {pipeline_id} not found")
        result = await pipeline_manager.handle_user_message(pipeline_id, req.text)
        return result

    @app.post("/api/pipelines/{pipeline_id}/approve")
    async def approve_pipeline(pipeline_id: int):
        if pipeline_manager is None:
            raise HTTPException(501, "Pipeline feature not configured")
        try:
            result = await pipeline_manager.approve(pipeline_id)
            return result
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.post("/api/pipelines/{pipeline_id}/reject")
    async def reject_pipeline(pipeline_id: int):
        if pipeline_manager is None:
            raise HTTPException(501, "Pipeline feature not configured")
        try:
            result = await pipeline_manager.reject(pipeline_id)
            return result
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.get("/api/config/auto-approve")
    async def get_auto_approve():
        if pipeline_manager is None:
            return {"auto_approve": False}
        return {"auto_approve": pipeline_manager.auto_approve}

    @app.post("/api/config/auto-approve")
    async def set_auto_approve(req: dict):
        if pipeline_manager is None:
            raise HTTPException(501, "Pipeline feature not configured")
        pipeline_manager.auto_approve = bool(req.get("auto_approve", True))
        return {"auto_approve": pipeline_manager.auto_approve}

    @app.get("/api/config/backend")
    async def get_backend():
        if workflow_loader is None:
            return {"backend": "claude", "model": "", "backends": ["claude", "copilot", "codex"]}
        cfg = workflow_loader.load()
        return {
            "backend": cfg.copilot.backend.value,
            "model": cfg.copilot.model,
            "backends": [b.value for b in BackendType],
        }

    @app.post("/api/config/backend")
    async def set_backend(req: dict):
        if workflow_loader is None:
            raise HTTPException(501, "Workflow loader not configured")
        backend_str = req.get("backend", "claude")
        model_str = req.get("model", "")
        try:
            backend = BackendType(backend_str)
        except ValueError:
            raise HTTPException(
                400,
                f"Unknown backend: {backend_str!r}. "
                f"Valid: {', '.join(b.value for b in BackendType)}",
            )
        workflow_loader.set_backend(backend, model_str)
        if on_backend_changed is not None:
            await on_backend_changed(backend, model_str)
        cfg = workflow_loader.load()
        return {"backend": cfg.copilot.backend.value, "model": cfg.copilot.model}

    @app.get("/api/pipelines/{pipeline_id}/artifacts")
    async def get_pipeline_artifacts(pipeline_id: int):
        if chat_store is None:
            raise HTTPException(501, "Pipeline feature not configured")
        pipeline = await chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            raise HTTPException(404, f"Pipeline {pipeline_id} not found")

        from maestro.planner import extract_verdict

        # Parse stories JSON
        stories_parsed = None
        if pipeline.stories_json:
            try:
                stories_parsed = json.loads(pipeline.stories_json)
                if not isinstance(stories_parsed, list):
                    stories_parsed = None
            except json.JSONDecodeError:
                stories_parsed = None

        # Extract verdicts from reports
        review_verdict = None
        if pipeline.review_report:
            review_verdict = extract_verdict(pipeline.review_report)

        test_verdict = None
        if pipeline.test_report:
            test_verdict = extract_verdict(pipeline.test_report)

        return {
            "repo_context": pipeline.repo_context,
            "clarification_questions_json": pipeline.clarification_questions_json,
            "clarification_answers_json": pipeline.clarification_answers_json,
            "analysis_doc": pipeline.analysis_doc,
            "stories_json": pipeline.stories_json,
            "stories_parsed": stories_parsed,
            "review_report": pipeline.review_report,
            "review_verdict": review_verdict,
            "test_report": pipeline.test_report,
            "test_verdict": test_verdict,
        }

    @app.get("/api/pipelines/{pipeline_id}/stories")
    async def get_pipeline_stories(pipeline_id: int):
        if chat_store is None:
            raise HTTPException(501, "Pipeline feature not configured")
        pipeline = await chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            raise HTTPException(404, f"Pipeline {pipeline_id} not found")
        if pipeline.stories_json:
            try:
                return json.loads(pipeline.stories_json)
            except json.JSONDecodeError:
                return {"raw": pipeline.stories_json}
        return []

    # --- Conversation endpoints ---

    @app.get("/api/conversations")
    async def list_conversations(status: str = "active"):
        if chat_store is None:
            raise HTTPException(501, "Chat store not configured")
        conversations = await chat_store.get_conversations(status=status)
        return [c.to_dict() for c in conversations]

    @app.post("/api/conversations", status_code=201)
    async def create_conversation(req: CreateConversationRequest):
        if chat_store is None:
            raise HTTPException(501, "Chat store not configured")
        conv = await chat_store.create_conversation(title=req.title)
        return conv.to_dict()

    @app.get("/api/conversations/{conv_id}")
    async def get_conversation(conv_id: int):
        if chat_store is None:
            raise HTTPException(501, "Chat store not configured")
        conv = await chat_store.get_conversation(conv_id)
        if conv is None:
            raise HTTPException(404, f"Conversation {conv_id} not found")
        return conv.to_dict()

    @app.get("/api/conversations/{conv_id}/messages")
    async def get_conversation_messages(conv_id: int, limit: int = 50):
        if chat_store is None:
            raise HTTPException(501, "Chat store not configured")
        conv = await chat_store.get_conversation(conv_id)
        if conv is None:
            raise HTTPException(404, f"Conversation {conv_id} not found")
        messages = await chat_store.get_conversation_messages(conv_id, limit=limit)
        return [m.to_dict() for m in messages]

    @app.post("/api/conversations/{conv_id}/messages", status_code=201)
    async def send_conversation_message(conv_id: int, req: SendMessageRequest):
        if conversation_manager is None:
            raise HTTPException(501, "Conversation manager not configured")
        result = await conversation_manager.handle_message(conv_id, req.text)
        return result

    @app.post("/api/chat", status_code=201)
    async def quick_chat(req: SendMessageRequest):
        """Quick chat endpoint: auto-creates conversation if needed."""
        if conversation_manager is None:
            raise HTTPException(501, "Conversation manager not configured")
        if chat_store is None:
            raise HTTPException(501, "Chat store not configured")
        conv = await chat_store.create_conversation(title=req.text[:40])
        result = await conversation_manager.handle_message(conv.id, req.text)
        result["conversation_id"] = conv.id
        return result

    # --- Context endpoints ---

    @app.get("/api/context/agents-md")
    async def get_agents_md():
        if context_engine is None:
            raise HTTPException(501, "Context engine not configured")
        files = await context_engine.scan_agents_md_files()
        return files

    @app.get("/api/context/repo-map")
    async def get_repo_map():
        if context_engine is None:
            raise HTTPException(501, "Context engine not configured")
        repo_map = await context_engine._build_repo_map()
        return {"repo_map": repo_map}

    @app.post("/api/context/refresh")
    async def refresh_context():
        if context_engine is None:
            raise HTTPException(501, "Context engine not configured")
        await context_engine.update_context_cache()
        return {"status": "refreshed"}

    # --- Quality endpoints ---

    @app.get("/api/quality/runs")
    async def get_quality_runs(issue_key: str | None = None, limit: int = 20):
        if quality_gate is None:
            raise HTTPException(501, "Quality gate not configured")
        runs = await quality_gate.get_runs(issue_key=issue_key, limit=limit)
        return [r.to_dict() for r in runs]

    @app.get("/api/quality/status")
    async def get_quality_status():
        if quality_gate is None:
            raise HTTPException(501, "Quality gate not configured")
        status = await quality_gate.get_status()
        return status

    # --- Entropy endpoints ---

    @app.post("/api/entropy/scan")
    async def start_entropy_scan():
        if entropy_manager is None:
            raise HTTPException(501, "Entropy manager not configured")
        tasks = await entropy_manager.run_scan()
        return [t.to_dict() for t in tasks]

    @app.get("/api/entropy/tasks")
    async def get_entropy_tasks():
        if entropy_manager is None:
            raise HTTPException(501, "Entropy manager not configured")
        tasks = await entropy_manager.get_tasks()
        return [t.to_dict() for t in tasks]

    @app.get("/api/entropy/findings")
    async def get_entropy_findings():
        if entropy_manager is None:
            raise HTTPException(501, "Entropy manager not configured")
        tasks = await entropy_manager.get_tasks()
        findings = [t.to_dict() for t in tasks if t.findings]
        return findings

    # --- WebSocket ---

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await ws_manager.connect(websocket)
        try:
            while True:
                data = await websocket.receive_text()
                stats = await board.get_stats()
                await websocket.send_json({"event": "stats", "data": stats})
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket)

    return app, _notify
