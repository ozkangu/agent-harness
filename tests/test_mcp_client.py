"""Tests for maestro.mcp_client."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import aiosqlite
import pytest

from maestro.mcp_client import MCPClientManager

pytestmark = pytest.mark.asyncio


class TestMCPClientManager:
    async def test_add_server(self, db: aiosqlite.Connection):
        mgr = MCPClientManager(db)
        with patch.object(mgr, "_connect", new_callable=AsyncMock):
            server = await mgr.add_server(
                name="test-server",
                transport="stdio",
                command="node",
                args=["server.js"],
            )
        assert server.name == "test-server"
        assert server.transport == "stdio"
        assert server.command == "node"
        assert server.args == ["server.js"]
        assert server.enabled is True

    async def test_list_servers(self, db: aiosqlite.Connection):
        mgr = MCPClientManager(db)
        with patch.object(mgr, "_connect", new_callable=AsyncMock):
            await mgr.add_server(name="s1", transport="stdio", command="cmd1")
            await mgr.add_server(name="s2", transport="stdio", command="cmd2")

        servers = await mgr.list_servers()
        assert len(servers) == 2

    async def test_get_server(self, db: aiosqlite.Connection):
        mgr = MCPClientManager(db)
        with patch.object(mgr, "_connect", new_callable=AsyncMock):
            server = await mgr.add_server(name="findme", transport="stdio", command="cmd")

        found = await mgr.get_server(server.id)
        assert found is not None
        assert found.name == "findme"

    async def test_remove_server(self, db: aiosqlite.Connection):
        mgr = MCPClientManager(db)
        with patch.object(mgr, "_connect", new_callable=AsyncMock):
            server = await mgr.add_server(name="removeme", transport="stdio", command="cmd")

        with patch.object(mgr, "_disconnect", new_callable=AsyncMock):
            await mgr.remove_server(server.id)

        found = await mgr.get_server(server.id)
        assert found is None

    async def test_toggle_server(self, db: aiosqlite.Connection):
        mgr = MCPClientManager(db)
        with patch.object(mgr, "_connect", new_callable=AsyncMock):
            server = await mgr.add_server(name="toggle", transport="stdio", command="cmd")

        with patch.object(mgr, "_disconnect", new_callable=AsyncMock):
            updated = await mgr.toggle_server(server.id, enabled=False)
        assert updated.enabled is False

        with patch.object(mgr, "_connect", new_callable=AsyncMock):
            updated = await mgr.toggle_server(server.id, enabled=True)
        assert updated.enabled is True

    async def test_call_tool_not_connected(self, db: aiosqlite.Connection):
        mgr = MCPClientManager(db)
        result = await mgr.call_tool(server_id=999, tool_name="test", arguments={})
        assert "error" in result
        assert "not connected" in result["error"]

    async def test_get_all_tools_empty(self, db: aiosqlite.Connection):
        mgr = MCPClientManager(db)
        tools = await mgr.get_all_tools()
        assert tools == []

    async def test_initialize_auto_connects(self, db: aiosqlite.Connection):
        mgr = MCPClientManager(db)
        with patch.object(mgr, "_connect", new_callable=AsyncMock) as mock_connect:
            # Add a server first
            from datetime import datetime, timezone
            import json

            now = datetime.now(timezone.utc).isoformat()
            await db.execute(
                """INSERT INTO mcp_servers (name, transport, command, args, env, enabled, status, tools, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 1, 'disconnected', '[]', ?, ?)""",
                ("auto-srv", "stdio", "cmd", "[]", "{}", now, now),
            )
            await db.commit()

            await mgr.initialize()
            assert mock_connect.call_count == 1
