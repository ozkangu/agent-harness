"""Data structures and SQLite schema for Maestro."""

from __future__ import annotations

import enum
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone


class PipelinePhase(str, enum.Enum):
    REPO_CONTEXT = "repo_context"
    CLARIFICATION = "clarification"
    AWAITING_CLARIFICATION = "awaiting_clarification"
    ANALYSIS_DOCUMENT = "analysis_document"
    BA_ANALYSIS = "ba_analysis"
    AWAITING_APPROVAL_1 = "awaiting_approval_1"
    CODING = "coding"
    AWAITING_APPROVAL_2 = "awaiting_approval_2"
    CODE_REVIEW = "code_review"
    AWAITING_APPROVAL_3 = "awaiting_approval_3"
    TEST_VALIDATION = "test_validation"
    AWAITING_APPROVAL_4 = "awaiting_approval_4"
    DONE = "done"
    FAILED = "failed"


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class TaskType(str, enum.Enum):
    CHAT = "chat"
    QUICK = "quick"
    STANDARD = "standard"
    PIPELINE = "pipeline"


class ConversationStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class IssueStatus(str, enum.Enum):
    TODO = "todo"
    WORKING = "working"
    REVIEW = "review"
    DONE = "done"
    FAILED = "failed"


# Valid status transitions
VALID_TRANSITIONS: dict[IssueStatus, set[IssueStatus]] = {
    IssueStatus.TODO: {IssueStatus.WORKING},
    IssueStatus.WORKING: {IssueStatus.REVIEW, IssueStatus.FAILED, IssueStatus.TODO},
    IssueStatus.REVIEW: {IssueStatus.DONE, IssueStatus.TODO},
    IssueStatus.FAILED: {IssueStatus.TODO},
    IssueStatus.DONE: set(),
}


@dataclass
class Issue:
    id: int
    key: str
    title: str
    description: str
    status: IssueStatus
    priority: str
    labels: list[str]
    created_at: datetime
    updated_at: datetime
    attempt_count: int = 0
    session_id: str | None = None
    branch_name: str | None = None
    pr_url: str | None = None
    error_log: str | None = None
    pipeline_id: int | None = None
    story_id: str | None = None
    depends_on: list[str] = field(default_factory=list)
    blocked_reason: str | None = None
    agent_name: str | None = None
    task_type: str = "standard"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "key": self.key,
            "title": self.title,
            "description": self.description,
            "status": self.status.value,
            "priority": self.priority,
            "labels": self.labels,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "attempt_count": self.attempt_count,
            "session_id": self.session_id,
            "branch_name": self.branch_name,
            "pr_url": self.pr_url,
            "error_log": self.error_log,
            "pipeline_id": self.pipeline_id,
            "story_id": self.story_id,
            "depends_on": self.depends_on,
            "blocked_reason": self.blocked_reason,
            "agent_name": self.agent_name,
            "task_type": self.task_type,
        }

    @classmethod
    def from_row(cls, row: dict) -> Issue:
        return cls(
            id=row["id"],
            key=row["key"],
            title=row["title"],
            description=row["description"],
            status=IssueStatus(row["status"]),
            priority=row["priority"],
            labels=json.loads(row["labels"]) if row["labels"] else [],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            attempt_count=row["attempt_count"],
            session_id=row["session_id"],
            branch_name=row["branch_name"],
            pr_url=row["pr_url"],
            error_log=row["error_log"],
            pipeline_id=row.get("pipeline_id"),
            story_id=row.get("story_id"),
            depends_on=json.loads(row["depends_on"]) if row.get("depends_on") else [],
            blocked_reason=row.get("blocked_reason"),
            agent_name=row.get("agent_name"),
            task_type=row.get("task_type", "standard"),
        )


@dataclass
class ActivityEntry:
    id: int
    issue_key: str
    event: str
    details: str
    timestamp: datetime

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "issue_key": self.issue_key,
            "event": self.event,
            "details": self.details,
            "timestamp": self.timestamp.isoformat(),
        }

    @classmethod
    def from_row(cls, row: dict) -> ActivityEntry:
        return cls(
            id=row["id"],
            issue_key=row["issue_key"],
            event=row["event"],
            details=row["details"],
            timestamp=datetime.fromisoformat(row["timestamp"]),
        )


@dataclass
class Pipeline:
    id: int
    name: str
    requirement: str
    phase: PipelinePhase
    created_at: datetime
    updated_at: datetime
    repo_context: str | None = None
    stories_json: str | None = None
    review_report: str | None = None
    test_report: str | None = None
    error: str | None = None
    clarification_questions_json: str | None = None
    clarification_answers_json: str | None = None
    analysis_doc: str | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "requirement": self.requirement,
            "phase": self.phase.value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "repo_context": self.repo_context,
            "stories_json": self.stories_json,
            "review_report": self.review_report,
            "test_report": self.test_report,
            "error": self.error,
            "clarification_questions_json": self.clarification_questions_json,
            "clarification_answers_json": self.clarification_answers_json,
            "analysis_doc": self.analysis_doc,
        }

    @classmethod
    def from_row(cls, row: dict) -> Pipeline:
        return cls(
            id=row["id"],
            name=row["name"],
            requirement=row["requirement"],
            phase=PipelinePhase(row["phase"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            repo_context=row["repo_context"],
            stories_json=row["stories_json"],
            review_report=row["review_report"],
            test_report=row["test_report"],
            error=row["error"],
            clarification_questions_json=row.get("clarification_questions_json"),
            clarification_answers_json=row.get("clarification_answers_json"),
            analysis_doc=row.get("analysis_doc"),
        )


@dataclass
class ChatMessage:
    id: int
    pipeline_id: int
    role: MessageRole
    content: str
    phase: PipelinePhase
    created_at: datetime
    metadata: str | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "pipeline_id": self.pipeline_id,
            "role": self.role.value,
            "content": self.content,
            "phase": self.phase.value,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_row(cls, row: dict) -> ChatMessage:
        return cls(
            id=row["id"],
            pipeline_id=row["pipeline_id"],
            role=MessageRole(row["role"]),
            content=row["content"],
            phase=PipelinePhase(row["phase"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            metadata=row["metadata"],
        )


@dataclass
class Conversation:
    id: int
    title: str
    status: ConversationStatus
    created_at: datetime
    updated_at: datetime
    pipeline_id: int | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "pipeline_id": self.pipeline_id,
        }

    @classmethod
    def from_row(cls, row: dict) -> Conversation:
        return cls(
            id=row["id"],
            title=row["title"],
            status=ConversationStatus(row["status"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            pipeline_id=row.get("pipeline_id"),
        )


@dataclass
class ContextDocument:
    id: int
    repo_path: str
    content: str
    doc_type: str
    version_hash: str
    created_at: datetime
    updated_at: datetime

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "repo_path": self.repo_path,
            "content": self.content,
            "doc_type": self.doc_type,
            "version_hash": self.version_hash,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_row(cls, row: dict) -> ContextDocument:
        return cls(
            id=row["id"],
            repo_path=row["repo_path"],
            content=row["content"],
            doc_type=row["doc_type"],
            version_hash=row["version_hash"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )


@dataclass
class QualityRun:
    id: int
    run_type: str
    status: str
    output: str
    triggered_by: str
    created_at: datetime
    issue_key: str | None = None
    conversation_id: int | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "issue_key": self.issue_key,
            "conversation_id": self.conversation_id,
            "run_type": self.run_type,
            "status": self.status,
            "output": self.output,
            "triggered_by": self.triggered_by,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_row(cls, row: dict) -> QualityRun:
        return cls(
            id=row["id"],
            issue_key=row.get("issue_key"),
            conversation_id=row.get("conversation_id"),
            run_type=row["run_type"],
            status=row["status"],
            output=row["output"],
            triggered_by=row["triggered_by"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )


@dataclass
class EntropyTask:
    id: int
    task_type: str
    status: str
    description: str
    created_at: datetime
    findings: str | None = None
    completed_at: datetime | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "task_type": self.task_type,
            "status": self.status,
            "description": self.description,
            "findings": self.findings,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

    @classmethod
    def from_row(cls, row: dict) -> EntropyTask:
        return cls(
            id=row["id"],
            task_type=row["task_type"],
            status=row["status"],
            description=row["description"],
            findings=row.get("findings"),
            created_at=datetime.fromisoformat(row["created_at"]),
            completed_at=datetime.fromisoformat(row["completed_at"]) if row.get("completed_at") else None,
        )


# Pipeline phase transitions
PHASE_TRANSITIONS: dict[PipelinePhase, set[PipelinePhase]] = {
    PipelinePhase.REPO_CONTEXT: {PipelinePhase.CLARIFICATION, PipelinePhase.FAILED},
    PipelinePhase.CLARIFICATION: {
        PipelinePhase.AWAITING_CLARIFICATION,
        PipelinePhase.ANALYSIS_DOCUMENT,
        PipelinePhase.FAILED,
    },
    PipelinePhase.AWAITING_CLARIFICATION: {PipelinePhase.CLARIFICATION, PipelinePhase.FAILED},
    PipelinePhase.ANALYSIS_DOCUMENT: {PipelinePhase.BA_ANALYSIS, PipelinePhase.FAILED},
    PipelinePhase.BA_ANALYSIS: {PipelinePhase.AWAITING_APPROVAL_1, PipelinePhase.FAILED},
    PipelinePhase.AWAITING_APPROVAL_1: {PipelinePhase.CODING},
    PipelinePhase.CODING: {PipelinePhase.AWAITING_APPROVAL_2, PipelinePhase.DONE, PipelinePhase.FAILED},
    PipelinePhase.AWAITING_APPROVAL_2: {PipelinePhase.CODE_REVIEW},
    PipelinePhase.CODE_REVIEW: {PipelinePhase.AWAITING_APPROVAL_3, PipelinePhase.FAILED},
    PipelinePhase.AWAITING_APPROVAL_3: {PipelinePhase.TEST_VALIDATION},
    PipelinePhase.TEST_VALIDATION: {PipelinePhase.AWAITING_APPROVAL_4, PipelinePhase.FAILED},
    PipelinePhase.AWAITING_APPROVAL_4: {PipelinePhase.DONE},
    PipelinePhase.DONE: set(),
    PipelinePhase.FAILED: {PipelinePhase.REPO_CONTEXT},
}


class BackendType(str, enum.Enum):
    CLAUDE = "claude"
    COPILOT = "copilot"
    CODEX = "codex"


@dataclass
class BackendConfig:
    backend: BackendType = BackendType.CLAUDE
    binary: str = ""
    model: str = ""
    agent: str = ""
    max_autopilot_continues: int = 50
    deny_tools: list[str] = field(default_factory=list)
    allow_tools: list[str] = field(default_factory=list)
    budget_usd: float | None = None
    sandbox_mode: str = ""
    extra_args: list[str] = field(default_factory=list)


CopilotConfig = BackendConfig


@dataclass
class HooksConfig:
    after_create: str | None = None
    before_run: str | None = None
    after_run: str | None = None
    before_remove: str | None = None


@dataclass
class OrchestratorConfig:
    repo_url: str = ""
    default_branch: str = "main"
    max_concurrent_agents: int = 3
    max_retries: int = 3
    stall_timeout_seconds: int = 300
    turn_timeout_seconds: int = 3600
    backoff_base_seconds: int = 60
    backoff_max_seconds: int = 3600
    web_port: int = 8420
    db_path: str = "maestro.db"
    issues_dir: str = "issues"
    auto_approve: bool = True
    max_inner_iterations: int = 3
    hooks: HooksConfig = field(default_factory=HooksConfig)


@dataclass
class MaestroConfig:
    copilot: CopilotConfig = field(default_factory=CopilotConfig)
    orchestrator: OrchestratorConfig = field(default_factory=OrchestratorConfig)
    prompt_template: str = ""


SCHEMA = """
CREATE TABLE IF NOT EXISTS pipelines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    requirement TEXT NOT NULL,
    phase TEXT DEFAULT 'repo_context',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    repo_context TEXT,
    clarification_questions_json TEXT,
    clarification_answers_json TEXT,
    analysis_doc TEXT,
    stories_json TEXT,
    review_report TEXT,
    test_report TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    labels TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    session_id TEXT,
    branch_name TEXT,
    pr_url TEXT,
    error_log TEXT,
    pipeline_id INTEGER REFERENCES pipelines(id),
    story_id TEXT,
    depends_on TEXT DEFAULT '[]',
    blocked_reason TEXT,
    agent_name TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    phase TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
);

CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_key TEXT NOT NULL,
    event TEXT NOT NULL,
    details TEXT DEFAULT '',
    timestamp TEXT NOT NULL,
    FOREIGN KEY (issue_key) REFERENCES issues(key)
);

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pipeline_id INTEGER REFERENCES pipelines(id)
);

CREATE TABLE IF NOT EXISTS context_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_path TEXT NOT NULL,
    content TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    version_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quality_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_key TEXT,
    conversation_id INTEGER,
    run_type TEXT NOT NULL,
    status TEXT NOT NULL,
    output TEXT DEFAULT '',
    triggered_by TEXT DEFAULT 'agent_action',
    created_at TEXT NOT NULL,
    FOREIGN KEY (issue_key) REFERENCES issues(key),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS entropy_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT NOT NULL,
    findings TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);
"""
