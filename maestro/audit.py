"""Immutable audit trail."""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import aiosqlite

logger = logging.getLogger(__name__)


@dataclass
class AuditEntry:
    """A single audit log entry."""

    id: int
    user_id: int | None
    username: str
    action: str
    resource_type: str
    resource_id: str
    result: str
    details: str
    ip_address: str
    user_agent: str
    timestamp: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "username": self.username,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "result": self.result,
            "details": self.details,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "timestamp": self.timestamp,
        }


class AuditLogger:
    """Immutable audit trail backed by SQLite."""

    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db

    async def initialize(self) -> None:
        """Tables and indexes created via SCHEMA in models.py."""
        pass

    async def log(
        self,
        action: str,
        resource_type: str = "",
        resource_id: str = "",
        result: str = "success",
        details: str = "",
        user_id: int | None = None,
        username: str = "",
        ip: str = "",
        user_agent: str = "",
    ) -> None:
        """Write an audit log entry."""
        now = datetime.now(timezone.utc).isoformat()
        await self._db.execute(
            """INSERT INTO audit_log
               (user_id, username, action, resource_type, resource_id, result, details, ip_address, user_agent, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, username, action, resource_type, resource_id, result, details, ip, user_agent, now),
        )
        await self._db.commit()

    async def query(
        self,
        action: str | None = None,
        resource_type: str | None = None,
        user_id: int | None = None,
        since: str | None = None,
        until: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditEntry]:
        """Query audit log with optional filters."""
        conditions: list[str] = []
        params: list = []

        if action:
            conditions.append("action = ?")
            params.append(action)
        if resource_type:
            conditions.append("resource_type = ?")
            params.append(resource_type)
        if user_id is not None:
            conditions.append("user_id = ?")
            params.append(user_id)
        if since:
            conditions.append("timestamp >= ?")
            params.append(since)
        if until:
            conditions.append("timestamp <= ?")
            params.append(until)

        where = " AND ".join(conditions) if conditions else "1=1"
        query = f"SELECT * FROM audit_log WHERE {where} ORDER BY id DESC LIMIT ? OFFSET ?"  # noqa: S608
        params.extend([limit, offset])

        async with self._db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
        return [self._row_to_entry(dict(row)) for row in rows]

    async def export_csv(self, **filters) -> str:
        """Export audit log as CSV string."""
        entries = await self.query(**filters)
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "id", "user_id", "username", "action", "resource_type",
                "resource_id", "result", "details", "ip_address",
                "user_agent", "timestamp",
            ],
        )
        writer.writeheader()
        for entry in entries:
            writer.writerow(entry.to_dict())
        return output.getvalue()

    @staticmethod
    def _row_to_entry(row: dict) -> AuditEntry:
        return AuditEntry(
            id=row["id"],
            user_id=row.get("user_id"),
            username=row.get("username", ""),
            action=row["action"],
            resource_type=row.get("resource_type", ""),
            resource_id=row.get("resource_id", ""),
            result=row.get("result", "success"),
            details=row.get("details", ""),
            ip_address=row.get("ip_address", ""),
            user_agent=row.get("user_agent", ""),
            timestamp=row["timestamp"],
        )
