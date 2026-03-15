"""Kanban board: SQLite CRUD and issue lifecycle management."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from cortex.constants import ISSUE_KEY_PREFIX
from cortex.models import (
    SCHEMA,
    VALID_TRANSITIONS,
    ActivityEntry,
    Issue,
    IssueStatus,
)

logger = logging.getLogger(__name__)


class Board:
    """Thread-safe async Kanban board backed by SQLite."""

    def __init__(self, db_path: str | Path) -> None:
        self.db_path = str(db_path)
        self._db: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        self._db = await aiosqlite.connect(self.db_path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA foreign_keys=ON")
        await self._db.executescript(SCHEMA)
        await self._run_migrations()
        await self._db.commit()

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    @property
    def db(self) -> aiosqlite.Connection:
        if self._db is None:
            raise RuntimeError("Board not connected. Call connect() first.")
        return self._db

    async def next_key(self) -> str:
        """Generate the next issue key like MST-1, MST-2, etc."""
        async with self.db.execute(
            "SELECT MAX(id) as max_id FROM issues"
        ) as cursor:
            row = await cursor.fetchone()
            next_id = (row["max_id"] or 0) + 1 if row else 1
        return f"{ISSUE_KEY_PREFIX}-{next_id}"

    async def _run_migrations(self) -> None:
        """Apply additive schema migrations for existing DB files."""
        await self._ensure_columns(
            "pipelines",
            {
                "clarification_questions_json": "TEXT",
                "clarification_answers_json": "TEXT",
                "analysis_doc": "TEXT",
            },
        )
        await self._ensure_columns(
            "issues",
            {
                "story_id": "TEXT",
                "depends_on": "TEXT DEFAULT '[]'",
                "blocked_reason": "TEXT",
                "agent_name": "TEXT",
                "task_type": "TEXT DEFAULT 'standard'",
            },
        )
        await self._ensure_columns(
            "messages",
            {
                "conversation_id": "INTEGER",
                "task_type": "TEXT",
                "context_snapshot": "TEXT",
            },
        )
        await self._ensure_columns(
            "pipelines",
            {
                "backend_config_json": "TEXT",
            },
        )

    async def _ensure_columns(self, table: str, columns: dict[str, str]) -> None:
        async with self.db.execute(f"PRAGMA table_info({table})") as cursor:  # noqa: S608
            rows = await cursor.fetchall()
        existing = {row["name"] for row in rows}
        for name, sql_type in columns.items():
            if name in existing:
                continue
            await self.db.execute(
                f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"  # noqa: S608
            )

    async def create_issue(
        self,
        title: str,
        description: str = "",
        priority: str = "medium",
        labels: list[str] | None = None,
        pipeline_id: int | None = None,
        story_id: str | None = None,
        depends_on: list[str] | None = None,
        blocked_reason: str | None = None,
        agent_name: str | None = None,
    ) -> Issue:
        """Create a new issue and return it."""
        key = await self.next_key()
        now = datetime.now(timezone.utc).isoformat()
        labels_json = json.dumps(labels or [])
        depends_on_json = json.dumps(depends_on or [])

        await self.db.execute(
            """INSERT INTO issues (key, title, description, status, priority, labels,
               created_at, updated_at, attempt_count, pipeline_id, story_id, depends_on,
               blocked_reason, agent_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)""",
            (key, title, description, IssueStatus.TODO.value, priority, labels_json,
             now, now, pipeline_id, story_id, depends_on_json, blocked_reason, agent_name),
        )
        await self.db.commit()

        await self.log_activity(key, "created", f"Issue created: {title}")
        logger.info("Created issue %s: %s", key, title)

        issue = await self.get_issue(key)
        assert issue is not None
        return issue

    async def get_issues_by_pipeline(self, pipeline_id: int) -> list[Issue]:
        """Get all issues associated with a pipeline."""
        async with self.db.execute(
            "SELECT * FROM issues WHERE pipeline_id = ? ORDER BY id",
            (pipeline_id,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [Issue.from_row(dict(row)) for row in rows]

    async def get_issues(self, status: IssueStatus | None = None) -> list[Issue]:
        """Get all issues, optionally filtered by status."""
        if status:
            query = "SELECT * FROM issues WHERE status = ? ORDER BY id"
            async with self.db.execute(query, (status.value,)) as cursor:
                rows = await cursor.fetchall()
        else:
            query = "SELECT * FROM issues ORDER BY id"
            async with self.db.execute(query) as cursor:
                rows = await cursor.fetchall()
        return [Issue.from_row(dict(row)) for row in rows]

    async def get_issue(self, key: str) -> Issue | None:
        """Get a single issue by key."""
        async with self.db.execute(
            "SELECT * FROM issues WHERE key = ?", (key,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            return Issue.from_row(dict(row))

    async def update_status(self, key: str, new_status: IssueStatus) -> Issue:
        """Transition an issue to a new status with validation."""
        issue = await self.get_issue(key)
        if issue is None:
            raise ValueError(f"Issue {key} not found")

        allowed = VALID_TRANSITIONS.get(issue.status, set())
        if new_status not in allowed:
            raise ValueError(
                f"Invalid transition: {issue.status.value} -> {new_status.value} "
                f"(allowed: {', '.join(s.value for s in allowed)})"
            )

        now = datetime.now(timezone.utc).isoformat()
        await self.db.execute(
            "UPDATE issues SET status = ?, updated_at = ? WHERE key = ?",
            (new_status.value, now, key),
        )
        await self.db.commit()

        await self.log_activity(
            key, "status_changed", f"{issue.status.value} -> {new_status.value}"
        )
        logger.info("Issue %s: %s -> %s", key, issue.status.value, new_status.value)

        updated = await self.get_issue(key)
        assert updated is not None
        return updated

    async def update_issue(self, key: str, **fields: str | int | None) -> Issue:
        """Update arbitrary fields on an issue."""
        issue = await self.get_issue(key)
        if issue is None:
            raise ValueError(f"Issue {key} not found")

        allowed_fields = {
            "title", "description", "priority", "labels", "session_id",
            "branch_name", "pr_url", "error_log", "attempt_count", "status",
            "pipeline_id", "story_id", "depends_on", "blocked_reason", "agent_name",
        }
        invalid = set(fields.keys()) - allowed_fields
        if invalid:
            raise ValueError(f"Invalid fields: {invalid}")

        if "labels" in fields and isinstance(fields["labels"], list):
            fields["labels"] = json.dumps(fields["labels"])
        if "depends_on" in fields and isinstance(fields["depends_on"], list):
            fields["depends_on"] = json.dumps(fields["depends_on"])

        if "status" in fields:
            # Use update_status for proper validation
            return await self.update_status(key, IssueStatus(fields.pop("status")))

        if not fields:
            return issue

        now = datetime.now(timezone.utc).isoformat()
        fields["updated_at"] = now

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [key]

        await self.db.execute(
            f"UPDATE issues SET {set_clause} WHERE key = ?",  # noqa: S608
            values,
        )
        await self.db.commit()

        updated = await self.get_issue(key)
        assert updated is not None
        return updated

    async def delete_issue(self, key: str) -> None:
        """Delete an issue and its activity log."""
        await self.db.execute("DELETE FROM activity_log WHERE issue_key = ?", (key,))
        await self.db.execute("DELETE FROM issues WHERE key = ?", (key,))
        await self.db.commit()
        logger.info("Deleted issue %s", key)

    async def log_activity(self, key: str, event: str, details: str = "") -> None:
        """Write an entry to the activity log."""
        now = datetime.now(timezone.utc).isoformat()
        await self.db.execute(
            "INSERT INTO activity_log (issue_key, event, details, timestamp) VALUES (?, ?, ?, ?)",
            (key, event, details, now),
        )
        await self.db.commit()

    async def get_activity(self, key: str) -> list[ActivityEntry]:
        """Get all activity log entries for an issue."""
        async with self.db.execute(
            "SELECT * FROM activity_log WHERE issue_key = ? ORDER BY id",
            (key,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [ActivityEntry.from_row(dict(row)) for row in rows]

    async def get_stats(self) -> dict:
        """Get dashboard statistics."""
        stats: dict[str, int] = {}
        for status in IssueStatus:
            async with self.db.execute(
                "SELECT COUNT(*) as cnt FROM issues WHERE status = ?",
                (status.value,),
            ) as cursor:
                row = await cursor.fetchone()
                stats[status.value] = row["cnt"] if row else 0
        stats["total"] = sum(stats.values())
        return stats
