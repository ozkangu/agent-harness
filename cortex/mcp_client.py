"""Manage connections to external MCP servers."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import aiosqlite

logger = logging.getLogger(__name__)


@dataclass
class MCPServerConfig:
    """Configuration for an external MCP server."""

    id: int
    name: str
    transport: str
    command: str
    args: list[str] = field(default_factory=list)
    env: dict[str, str] = field(default_factory=dict)
    enabled: bool = True
    status: str = "disconnected"
    tools: list[dict] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "transport": self.transport,
            "command": self.command,
            "args": self.args,
            "env": self.env,
            "enabled": self.enabled,
            "status": self.status,
            "tools": self.tools,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class MCPClientManager:
    """Manage connections to external MCP servers."""

    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db
        self._connections: dict[int, object] = {}
        self._sessions: dict[int, object] = {}

    async def initialize(self) -> None:
        """Create table and auto-connect enabled servers."""
        # Table created via SCHEMA in models.py, just ensure enabled servers connect
        servers = await self.list_servers()
        for server in servers:
            if server.enabled:
                try:
                    await self._connect(server.id)
                except Exception:
                    logger.debug("Failed to auto-connect MCP server %s", server.name)

    async def add_server(
        self,
        name: str,
        transport: str,
        command: str,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
    ) -> MCPServerConfig:
        """Add a new external MCP server."""
        now = datetime.now(timezone.utc).isoformat()
        args_json = json.dumps(args or [])
        env_json = json.dumps(env or {})

        cursor = await self._db.execute(
            """INSERT INTO mcp_servers (name, transport, command, args, env, enabled, status, tools, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, 'disconnected', '[]', ?, ?)""",
            (name, transport, command, args_json, env_json, now, now),
        )
        await self._db.commit()

        server_id = cursor.lastrowid or 0
        server = await self.get_server(server_id)
        assert server is not None

        # Try to connect
        try:
            await self._connect(server.id)
        except Exception:
            logger.debug("Failed to connect new MCP server %s", name)

        return server

    async def remove_server(self, server_id: int) -> None:
        """Remove an MCP server and disconnect."""
        await self._disconnect(server_id)
        await self._db.execute("DELETE FROM mcp_servers WHERE id = ?", (server_id,))
        await self._db.commit()

    async def list_servers(self) -> list[MCPServerConfig]:
        """List all configured MCP servers."""
        async with self._db.execute(
            "SELECT * FROM mcp_servers ORDER BY id"
        ) as cursor:
            rows = await cursor.fetchall()
        return [self._row_to_config(dict(row)) for row in rows]

    async def get_server(self, server_id: int) -> MCPServerConfig | None:
        """Get a single MCP server by ID."""
        async with self._db.execute(
            "SELECT * FROM mcp_servers WHERE id = ?", (server_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_config(dict(row))

    async def toggle_server(self, server_id: int, enabled: bool) -> MCPServerConfig:
        """Enable or disable an MCP server."""
        now = datetime.now(timezone.utc).isoformat()
        await self._db.execute(
            "UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?",
            (1 if enabled else 0, now, server_id),
        )
        await self._db.commit()

        if enabled:
            try:
                await self._connect(server_id)
            except Exception:
                logger.debug("Failed to connect MCP server %d", server_id)
        else:
            await self._disconnect(server_id)

        server = await self.get_server(server_id)
        assert server is not None
        return server

    async def call_tool(self, server_id: int, tool_name: str, arguments: dict) -> dict:
        """Call a tool on a connected MCP server."""
        session = self._sessions.get(server_id)
        if session is None:
            return {"error": f"Server {server_id} not connected"}

        try:
            from mcp import ClientSession
            if isinstance(session, ClientSession):
                result = await session.call_tool(tool_name, arguments=arguments)
                # Extract text content from result
                content_parts = []
                for item in result.content:
                    if hasattr(item, "text"):
                        content_parts.append(item.text)
                return {"result": "\n".join(content_parts), "is_error": result.isError}
        except ImportError:
            return {"error": "mcp package not installed"}
        except Exception as e:
            return {"error": str(e)}

        return {"error": "Session type not supported"}

    async def get_all_tools(self) -> list[dict]:
        """Get all tools across all connected servers."""
        all_tools: list[dict] = []
        servers = await self.list_servers()
        for server in servers:
            if server.enabled and server.status == "connected":
                for tool in server.tools:
                    all_tools.append({
                        "server_id": server.id,
                        "server_name": server.name,
                        **tool,
                    })
        return all_tools

    async def _connect(self, server_id: int) -> None:
        """Connect to an MCP server."""
        server = await self.get_server(server_id)
        if server is None:
            return

        now = datetime.now(timezone.utc).isoformat()

        try:
            from mcp import ClientSession, StdioServerParameters
            from mcp.client.stdio import stdio_client

            if server.transport == "stdio":
                params = StdioServerParameters(
                    command=server.command,
                    args=server.args,
                    env=server.env if server.env else None,
                )
                # Start the stdio client
                read_stream, write_stream = await stdio_client(params).__aenter__()
                session = await ClientSession(read_stream, write_stream).__aenter__()
                await session.initialize()

                self._connections[server_id] = (read_stream, write_stream)
                self._sessions[server_id] = session

                # Discover tools
                tools_result = await session.list_tools()
                tools = [
                    {"name": t.name, "description": t.description or ""}
                    for t in tools_result.tools
                ]

                await self._db.execute(
                    "UPDATE mcp_servers SET status = 'connected', tools = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(tools), now, server_id),
                )
                await self._db.commit()
                logger.info("Connected to MCP server: %s (%d tools)", server.name, len(tools))
            else:
                logger.warning("Unsupported MCP transport: %s", server.transport)
                await self._db.execute(
                    "UPDATE mcp_servers SET status = 'error', updated_at = ? WHERE id = ?",
                    (now, server_id),
                )
                await self._db.commit()

        except ImportError:
            logger.warning("mcp package not installed -- cannot connect to MCP server")
            await self._db.execute(
                "UPDATE mcp_servers SET status = 'error', updated_at = ? WHERE id = ?",
                (now, server_id),
            )
            await self._db.commit()
        except Exception:
            logger.exception("Failed to connect to MCP server %s", server.name)
            await self._db.execute(
                "UPDATE mcp_servers SET status = 'error', updated_at = ? WHERE id = ?",
                (now, server_id),
            )
            await self._db.commit()

    async def _disconnect(self, server_id: int) -> None:
        """Disconnect from an MCP server."""
        session = self._sessions.pop(server_id, None)
        conn = self._connections.pop(server_id, None)

        if session is not None:
            try:
                aexit_fn = getattr(session, "__aexit__", None)
                if aexit_fn is not None:
                    await aexit_fn(None, None, None)
            except Exception:
                pass

        if conn is not None:
            try:
                aexit = getattr(conn, "__aexit__", None)
                if aexit is not None:
                    await aexit(None, None, None)
            except Exception:
                pass

        now = datetime.now(timezone.utc).isoformat()
        await self._db.execute(
            "UPDATE mcp_servers SET status = 'disconnected', updated_at = ? WHERE id = ?",
            (now, server_id),
        )
        await self._db.commit()

    @staticmethod
    def _row_to_config(row: dict) -> MCPServerConfig:
        return MCPServerConfig(
            id=row["id"],
            name=row["name"],
            transport=row["transport"],
            command=row["command"],
            args=json.loads(row["args"]) if row["args"] else [],
            env=json.loads(row["env"]) if row["env"] else {},
            enabled=bool(row["enabled"]),
            status=row["status"],
            tools=json.loads(row["tools"]) if row["tools"] else [],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
