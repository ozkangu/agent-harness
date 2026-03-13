"""Chat store: pipeline and message CRUD backed by SQLite."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

import aiosqlite

from maestro.models import (
    ChatMessage,
    Conversation,
    ConversationStatus,
    MessageRole,
    Pipeline,
    PipelinePhase,
)

logger = logging.getLogger(__name__)


class ChatStore:
    """Async pipeline and chat message persistence using the shared DB connection."""

    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    @property
    def db(self) -> aiosqlite.Connection:
        return self._db

    # -- Pipeline CRUD --

    async def create_pipeline(self, name: str, requirement: str) -> Pipeline:
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self.db.execute(
            """INSERT INTO pipelines (name, requirement, phase, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)""",
            (name, requirement, PipelinePhase.REPO_CONTEXT.value, now, now),
        )
        await self.db.commit()
        pipeline_id = cursor.lastrowid
        pipeline = await self.get_pipeline(pipeline_id)
        assert pipeline is not None
        logger.info("Created pipeline %d: %s", pipeline_id, name)
        return pipeline

    async def get_pipeline(self, pipeline_id: int) -> Pipeline | None:
        async with self.db.execute(
            "SELECT * FROM pipelines WHERE id = ?", (pipeline_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            return Pipeline.from_row(dict(row))

    async def get_pipelines(self) -> list[Pipeline]:
        async with self.db.execute(
            "SELECT * FROM pipelines ORDER BY id DESC"
        ) as cursor:
            rows = await cursor.fetchall()
        return [Pipeline.from_row(dict(row)) for row in rows]

    async def update_pipeline(self, pipeline_id: int, **fields: str | None) -> Pipeline:
        pipeline = await self.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        allowed_fields = {
            "name", "requirement", "phase", "repo_context",
            "clarification_questions_json", "clarification_answers_json", "analysis_doc",
            "stories_json", "review_report", "test_report", "error",
        }
        invalid = set(fields.keys()) - allowed_fields
        if invalid:
            raise ValueError(f"Invalid fields: {invalid}")

        if not fields:
            return pipeline

        now = datetime.now(timezone.utc).isoformat()
        fields["updated_at"] = now

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [pipeline_id]

        await self.db.execute(
            f"UPDATE pipelines SET {set_clause} WHERE id = ?",  # noqa: S608
            values,
        )
        await self.db.commit()

        updated = await self.get_pipeline(pipeline_id)
        assert updated is not None
        return updated

    # -- Message CRUD --

    async def add_message(
        self,
        pipeline_id: int,
        role: MessageRole,
        content: str,
        phase: PipelinePhase,
        metadata: str | None = None,
    ) -> ChatMessage:
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self.db.execute(
            """INSERT INTO messages (pipeline_id, role, content, phase, metadata, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (pipeline_id, role.value, content, phase.value, metadata, now),
        )
        await self.db.commit()
        msg_id = cursor.lastrowid

        async with self.db.execute(
            "SELECT * FROM messages WHERE id = ?", (msg_id,)
        ) as cur:
            row = await cur.fetchone()
            assert row is not None
            return ChatMessage.from_row(dict(row))

    async def get_messages(self, pipeline_id: int) -> list[ChatMessage]:
        async with self.db.execute(
            "SELECT * FROM messages WHERE pipeline_id = ? ORDER BY id",
            (pipeline_id,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [ChatMessage.from_row(dict(row)) for row in rows]

    # -- Conversation CRUD --

    async def create_conversation(
        self, title: str = "New Chat", pipeline_id: int | None = None,
    ) -> Conversation:
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self.db.execute(
            """INSERT INTO conversations (title, status, created_at, updated_at, pipeline_id)
               VALUES (?, ?, ?, ?, ?)""",
            (title, ConversationStatus.ACTIVE.value, now, now, pipeline_id),
        )
        await self.db.commit()
        conv_id = cursor.lastrowid
        conv = await self.get_conversation(conv_id)
        assert conv is not None
        logger.info("Created conversation %d: %s", conv_id, title)
        return conv

    async def get_conversation(self, conv_id: int) -> Conversation | None:
        async with self.db.execute(
            "SELECT * FROM conversations WHERE id = ?", (conv_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            return Conversation.from_row(dict(row))

    async def get_conversations(
        self, status: str = "active",
    ) -> list[Conversation]:
        async with self.db.execute(
            "SELECT * FROM conversations WHERE status = ? ORDER BY id DESC",
            (status,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [Conversation.from_row(dict(row)) for row in rows]

    async def update_conversation(
        self, conv_id: int, **fields: str | int | None,
    ) -> Conversation:
        conv = await self.get_conversation(conv_id)
        if conv is None:
            raise ValueError(f"Conversation {conv_id} not found")

        allowed_fields = {"title", "status", "pipeline_id"}
        invalid = set(fields.keys()) - allowed_fields
        if invalid:
            raise ValueError(f"Invalid fields: {invalid}")

        if not fields:
            return conv

        now = datetime.now(timezone.utc).isoformat()
        fields["updated_at"] = now

        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [conv_id]

        await self.db.execute(
            f"UPDATE conversations SET {set_clause} WHERE id = ?",  # noqa: S608
            values,
        )
        await self.db.commit()

        updated = await self.get_conversation(conv_id)
        assert updated is not None
        return updated

    async def add_conversation_message(
        self,
        conversation_id: int,
        role: MessageRole,
        content: str,
        task_type: str | None = None,
        context_snapshot: str | None = None,
    ) -> ChatMessage:
        """Add a message linked to a conversation (uses pipeline_id=0 as placeholder)."""
        now = datetime.now(timezone.utc).isoformat()
        cursor = await self.db.execute(
            """INSERT INTO messages
               (pipeline_id, role, content, phase, metadata, created_at,
                conversation_id, task_type, context_snapshot)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                0,  # pipeline_id placeholder for conversation messages
                role.value,
                content,
                "repo_context",  # default phase for conversation messages
                None,
                now,
                conversation_id,
                task_type,
                context_snapshot,
            ),
        )
        await self.db.commit()
        msg_id = cursor.lastrowid

        async with self.db.execute(
            "SELECT * FROM messages WHERE id = ?", (msg_id,)
        ) as cur:
            row = await cur.fetchone()
            assert row is not None
            return ChatMessage.from_row(dict(row))

    async def get_conversation_messages(
        self, conversation_id: int, limit: int = 50,
    ) -> list[ChatMessage]:
        async with self.db.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?",
            (conversation_id, limit),
        ) as cursor:
            rows = await cursor.fetchall()
        # Return in chronological order
        messages = [ChatMessage.from_row(dict(row)) for row in rows]
        messages.reverse()
        return messages
