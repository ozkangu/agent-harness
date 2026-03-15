"""Tests for cortex.audit."""

from __future__ import annotations

import aiosqlite
import pytest

from cortex.audit import AuditLogger

pytestmark = pytest.mark.asyncio


class TestAuditLogger:
    async def test_log_entry(self, db: aiosqlite.Connection):
        logger = AuditLogger(db)
        await logger.log(
            action="create",
            resource_type="issue",
            resource_id="CTX-1",
            user_id=1,
            username="admin",
        )

        entries = await logger.query()
        assert len(entries) == 1
        assert entries[0].action == "create"
        assert entries[0].resource_type == "issue"
        assert entries[0].resource_id == "CTX-1"
        assert entries[0].username == "admin"

    async def test_query_by_action(self, db: aiosqlite.Connection):
        logger = AuditLogger(db)
        await logger.log(action="create", resource_type="issue")
        await logger.log(action="delete", resource_type="issue")
        await logger.log(action="create", resource_type="pipeline")

        entries = await logger.query(action="create")
        assert len(entries) == 2

    async def test_query_by_resource_type(self, db: aiosqlite.Connection):
        logger = AuditLogger(db)
        await logger.log(action="create", resource_type="issue")
        await logger.log(action="create", resource_type="pipeline")

        entries = await logger.query(resource_type="pipeline")
        assert len(entries) == 1
        assert entries[0].resource_type == "pipeline"

    async def test_query_by_user_id(self, db: aiosqlite.Connection):
        logger = AuditLogger(db)
        await logger.log(action="create", user_id=1)
        await logger.log(action="create", user_id=2)

        entries = await logger.query(user_id=1)
        assert len(entries) == 1

    async def test_query_limit_offset(self, db: aiosqlite.Connection):
        logger = AuditLogger(db)
        for i in range(5):
            await logger.log(action=f"action_{i}")

        entries = await logger.query(limit=2)
        assert len(entries) == 2

        entries = await logger.query(limit=2, offset=3)
        assert len(entries) == 2

    async def test_export_csv(self, db: aiosqlite.Connection):
        logger = AuditLogger(db)
        await logger.log(action="login", username="admin", resource_type="auth")

        csv_output = await logger.export_csv()
        assert "action" in csv_output
        assert "login" in csv_output
        assert "admin" in csv_output

    async def test_export_csv_empty(self, db: aiosqlite.Connection):
        logger = AuditLogger(db)
        csv_output = await logger.export_csv()
        lines = csv_output.strip().split("\n")
        assert len(lines) == 1  # Header only
