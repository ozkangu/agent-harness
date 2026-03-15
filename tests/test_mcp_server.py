"""Tests for cortex.mcp_server."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from cortex.mcp_server import create_mcp_server

pytestmark = pytest.mark.asyncio


class TestMCPServer:
    def test_returns_none_without_mcp_package(self):
        with patch.dict("sys.modules", {"mcp": None, "mcp.server.fastmcp": None}):
            # Force ImportError by patching the import
            with patch("cortex.mcp_server.create_mcp_server") as mock_create:
                # Test the real function behavior
                pass

        # Directly test: if mcp is not importable, returns None
        import importlib
        import cortex.mcp_server as mod

        original = create_mcp_server.__code__

        # Simplest: just call with None args and mock the import to fail
        with patch("builtins.__import__", side_effect=ImportError("no mcp")):
            # Re-call the function fresh
            result = create_mcp_server(None, None)
            assert result is None

    def test_tool_registration_with_mocked_fastmcp(self):
        mock_fastmcp_class = MagicMock()
        mock_mcp_instance = MagicMock()
        mock_fastmcp_class.return_value = mock_mcp_instance

        mock_module = MagicMock()
        mock_module.FastMCP = mock_fastmcp_class

        with patch.dict("sys.modules", {"mcp": MagicMock(), "mcp.server": MagicMock(), "mcp.server.fastmcp": mock_module}):
            import importlib
            import cortex.mcp_server

            importlib.reload(cortex.mcp_server)
            result = cortex.mcp_server.create_mcp_server(
                context_engine=MagicMock(),
                chat_store=MagicMock(),
            )

        assert result is mock_mcp_instance
        # Verify tools were registered via @mcp.tool()
        assert mock_mcp_instance.tool.call_count >= 6
        # Verify resources were registered
        assert mock_mcp_instance.resource.call_count >= 2
