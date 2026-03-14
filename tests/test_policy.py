"""Tests for maestro.policy."""

from __future__ import annotations

import json

import aiosqlite
import pytest

from maestro.policy import PolicyEngine

pytestmark = pytest.mark.asyncio


class TestPolicyEngine:
    async def test_create_policy(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        policy = await engine.create_policy(
            name="test-policy",
            description="A test policy",
            rules={"denied_tools": ["shell"]},
        )
        assert policy.name == "test-policy"
        assert policy.enabled is True
        assert policy.rules["denied_tools"] == ["shell"]

    async def test_list_policies(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        await engine.create_policy(name="p1")
        await engine.create_policy(name="p2")

        policies = await engine.list_policies()
        assert len(policies) == 2

    async def test_update_policy(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        policy = await engine.create_policy(name="original")
        updated = await engine.update_policy(
            policy.id, name="updated", enabled=False
        )
        assert updated.name == "updated"
        assert updated.enabled is False

    async def test_delete_policy(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        policy = await engine.create_policy(name="to-delete")
        await engine.delete_policy(policy.id)
        result = await engine.get_policy(policy.id)
        assert result is None

    async def test_tool_approval_allowed(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        await engine.create_policy(
            name="allow-all",
            rules={"denied_tools": ["dangerous_tool"]},
        )
        result = await engine.check_tool_approval("safe_tool")
        assert result["approved"] is True

    async def test_tool_approval_denied(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        await engine.create_policy(
            name="deny-shell",
            rules={"denied_tools": ["shell"]},
        )
        result = await engine.check_tool_approval("shell")
        assert result["approved"] is False
        assert "denied" in result["reason"]

    async def test_tool_requires_approval(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        await engine.create_policy(
            name="approval-required",
            rules={"require_approval_tools": ["deploy"]},
        )
        result = await engine.check_tool_approval("deploy")
        assert result["approved"] is False
        assert "requires manual approval" in result["reason"]

    async def test_budget_within_limit(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            """INSERT INTO budget_limits (scope, scope_id, max_budget_usd, current_spend_usd, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            ("global", "", 100.0, 20.0, now),
        )
        await db.commit()

        result = await engine.check_budget("global", "", 50.0)
        assert result["within_budget"] is True

    async def test_budget_exceeded(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            """INSERT INTO budget_limits (scope, scope_id, max_budget_usd, current_spend_usd, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            ("global", "", 100.0, 95.0, now),
        )
        await db.commit()

        result = await engine.check_budget("global", "", 10.0)
        assert result["within_budget"] is False

    async def test_budget_no_limit(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        result = await engine.check_budget("global", "", 999.0)
        assert result["within_budget"] is True

    async def test_soul_md_loading(self, db: aiosqlite.Connection, tmp_path):
        soul_path = tmp_path / "SOUL.md"
        soul_path.write_text("# Security Policy\nNo eval allowed.")

        engine = PolicyEngine(db, repo_dir=str(tmp_path))
        await engine.initialize()

        policies = await engine.list_policies()
        assert len(policies) == 1
        assert policies[0].name == "SOUL.md"
        assert "No eval allowed" in json.dumps(policies[0].rules)

    async def test_pipeline_scoped_policies(self, db: aiosqlite.Connection):
        engine = PolicyEngine(db)
        await engine.create_policy(
            name="global-policy",
            rules={"denied_tools": ["rm"]},
            scope="global",
        )
        await engine.create_policy(
            name="pipeline-policy",
            rules={"denied_tools": ["deploy"]},
            scope="pipeline",
            scope_id="42",
        )

        # Global query should only get global policies
        global_policies = await engine.get_active_policies()
        assert len(global_policies) == 1
        assert global_policies[0].name == "global-policy"

        # Pipeline query should get both global and matching pipeline policies
        pipeline_policies = await engine.get_active_policies(pipeline_id=42)
        assert len(pipeline_policies) == 2
