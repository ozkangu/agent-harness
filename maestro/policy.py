"""SOUL.md + policy engine for security policies."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

logger = logging.getLogger(__name__)


@dataclass
class SecurityPolicy:
    """A security policy with rules."""

    id: int
    name: str
    description: str
    rules: dict
    scope: str
    scope_id: str
    enabled: bool
    created_at: str
    updated_at: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "rules": self.rules,
            "scope": self.scope,
            "scope_id": self.scope_id,
            "enabled": self.enabled,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class PolicyEngine:
    """Security policy engine supporting SOUL.md and configurable rules."""

    def __init__(self, db: aiosqlite.Connection, repo_dir: str | None = None) -> None:
        self._db = db
        self._repo_dir = Path(repo_dir) if repo_dir else None

    async def initialize(self) -> None:
        """Load SOUL.md if present and create default policies."""
        if self._repo_dir:
            soul_path = self._repo_dir / "SOUL.md"
            if soul_path.exists():
                try:
                    content = soul_path.read_text(encoding="utf-8")
                    # Check if SOUL.md policy already exists
                    async with self._db.execute(
                        "SELECT id FROM security_policies WHERE name = 'SOUL.md'"
                    ) as cursor:
                        existing = await cursor.fetchone()
                    if not existing:
                        now = datetime.now(timezone.utc).isoformat()
                        rules = json.dumps({"soul_md_content": content})
                        await self._db.execute(
                            """INSERT INTO security_policies (name, description, rules, scope, scope_id, enabled, created_at, updated_at)
                               VALUES ('SOUL.md', 'Auto-loaded from repository SOUL.md', ?, 'global', '', 1, ?, ?)""",
                            (rules, now, now),
                        )
                        await self._db.commit()
                        logger.info("Loaded SOUL.md as security policy")
                except Exception:
                    logger.debug("Failed to load SOUL.md")

    async def check_tool_approval(
        self, tool_name: str, pipeline_id: int | None = None
    ) -> dict:
        """Check if a tool is approved by active policies."""
        policies = await self.get_active_policies(pipeline_id)

        for policy in policies:
            rules = policy.rules
            denied = rules.get("denied_tools", [])
            if tool_name in denied:
                return {"approved": False, "reason": f"Tool '{tool_name}' denied by policy '{policy.name}'"}

            require_approval = rules.get("require_approval_tools", [])
            if tool_name in require_approval:
                return {"approved": False, "reason": f"Tool '{tool_name}' requires manual approval per policy '{policy.name}'"}

        return {"approved": True}

    async def check_budget(
        self, scope: str, scope_id: str, amount_usd: float
    ) -> dict:
        """Check if a budget amount is within limits."""
        async with self._db.execute(
            "SELECT * FROM budget_limits WHERE scope = ? AND scope_id = ?",
            (scope, scope_id),
        ) as cursor:
            row = await cursor.fetchone()

        if row is None:
            # No budget limit set
            return {"within_budget": True}

        row_dict = dict(row)
        remaining = row_dict["max_budget_usd"] - row_dict["current_spend_usd"]
        if amount_usd > remaining:
            return {
                "within_budget": False,
                "remaining_usd": remaining,
            }
        return {
            "within_budget": True,
            "remaining_usd": remaining - amount_usd,
        }

    async def get_active_policies(
        self, pipeline_id: int | None = None
    ) -> list[SecurityPolicy]:
        """Get all active policies, optionally filtered by pipeline scope."""
        conditions = ["enabled = 1"]
        params: list = []

        if pipeline_id is not None:
            conditions.append("(scope = 'global' OR (scope = 'pipeline' AND scope_id = ?))")
            params.append(str(pipeline_id))
        else:
            conditions.append("scope = 'global'")

        where = " AND ".join(conditions)
        query = f"SELECT * FROM security_policies WHERE {where} ORDER BY id"  # noqa: S608

        async with self._db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
        return [self._row_to_policy(dict(row)) for row in rows]

    async def list_policies(self) -> list[SecurityPolicy]:
        """List all policies."""
        async with self._db.execute(
            "SELECT * FROM security_policies ORDER BY id"
        ) as cursor:
            rows = await cursor.fetchall()
        return [self._row_to_policy(dict(row)) for row in rows]

    async def create_policy(
        self,
        name: str,
        description: str = "",
        rules: dict | None = None,
        scope: str = "global",
        scope_id: str = "",
    ) -> SecurityPolicy:
        """Create a new security policy."""
        now = datetime.now(timezone.utc).isoformat()
        rules_json = json.dumps(rules or {})

        cursor = await self._db.execute(
            """INSERT INTO security_policies (name, description, rules, scope, scope_id, enabled, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
            (name, description, rules_json, scope, scope_id, now, now),
        )
        await self._db.commit()

        policy = await self.get_policy(cursor.lastrowid or 0)
        assert policy is not None
        return policy

    async def get_policy(self, policy_id: int) -> SecurityPolicy | None:
        """Get a policy by ID."""
        async with self._db.execute(
            "SELECT * FROM security_policies WHERE id = ?", (policy_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_policy(dict(row))

    async def update_policy(self, policy_id: int, **fields) -> SecurityPolicy:
        """Update a policy."""
        now = datetime.now(timezone.utc).isoformat()

        if "rules" in fields and isinstance(fields["rules"], dict):
            fields["rules"] = json.dumps(fields["rules"])
        if "enabled" in fields:
            fields["enabled"] = 1 if fields["enabled"] else 0

        fields["updated_at"] = now
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [policy_id]

        await self._db.execute(
            f"UPDATE security_policies SET {set_clause} WHERE id = ?",  # noqa: S608
            values,
        )
        await self._db.commit()

        policy = await self.get_policy(policy_id)
        assert policy is not None
        return policy

    async def delete_policy(self, policy_id: int) -> None:
        """Delete a policy."""
        await self._db.execute("DELETE FROM security_policies WHERE id = ?", (policy_id,))
        await self._db.commit()

    @staticmethod
    def _row_to_policy(row: dict) -> SecurityPolicy:
        rules = row.get("rules", "{}")
        if isinstance(rules, str):
            try:
                rules = json.loads(rules)
            except json.JSONDecodeError:
                rules = {}
        return SecurityPolicy(
            id=row["id"],
            name=row["name"],
            description=row.get("description", ""),
            rules=rules,
            scope=row.get("scope", "global"),
            scope_id=row.get("scope_id", ""),
            enabled=bool(row.get("enabled", 1)),
            created_at=row.get("created_at", ""),
            updated_at=row.get("updated_at", ""),
        )
