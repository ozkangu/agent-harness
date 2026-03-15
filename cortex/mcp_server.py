"""Cortex as MCP server -- expose context engine to external tools via FastMCP."""

from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


def create_mcp_server(context_engine, chat_store):
    """Create and configure the FastMCP server exposing Cortex tools and resources.

    Returns the FastMCP server instance, or None if the mcp package is not installed.
    """
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError:
        logger.warning("mcp package not installed -- MCP server disabled")
        return None

    mcp = FastMCP("Cortex", description="Cortex AI orchestrator context engine")

    @mcp.tool()
    async def get_repo_map() -> str:
        """Get the repository structure tree."""
        if context_engine is None:
            return "Context engine not configured"
        repo_map = await context_engine._build_repo_map()
        return repo_map or "No repo map available"

    @mcp.tool()
    async def get_agents_md(target_modules: list[str] | None = None) -> str:
        """Get AGENTS.md content from the repository.

        Args:
            target_modules: Optional list of module paths to filter by
        """
        if context_engine is None:
            return "Context engine not configured"
        content = await context_engine._load_agents_md(target_modules=target_modules)
        return content or "No AGENTS.md files found"

    @mcp.tool()
    async def get_constraints() -> str:
        """Get project constraint files (linter configs, tsconfig, etc.)."""
        if context_engine is None:
            return "Context engine not configured"
        constraints = await context_engine._load_constraints()
        return constraints or "No constraint files found"

    @mcp.tool()
    async def build_full_context(
        include_agents_md: bool = True,
        include_repo_map: bool = True,
        include_constraints: bool = True,
    ) -> str:
        """Build complete context for agent prompts.

        Args:
            include_agents_md: Include AGENTS.md content
            include_repo_map: Include repository structure
            include_constraints: Include project constraints
        """
        if context_engine is None:
            return "Context engine not configured"
        return await context_engine.build_context(
            include_agents_md=include_agents_md,
            include_repo_map=include_repo_map,
            include_constraints=include_constraints,
        )

    @mcp.tool()
    async def list_pipelines() -> str:
        """List all pipelines with their current phase."""
        if chat_store is None:
            return "Chat store not configured"
        pipelines = await chat_store.get_pipelines()
        if not pipelines:
            return "No pipelines found"
        result = []
        for p in pipelines:
            result.append(f"Pipeline #{p.id}: {p.name} [phase: {p.phase.value}]")
        return "\n".join(result)

    @mcp.tool()
    async def get_pipeline_status(pipeline_id: int) -> str:
        """Get detailed status of a specific pipeline.

        Args:
            pipeline_id: The pipeline ID to query
        """
        if chat_store is None:
            return "Chat store not configured"
        pipeline = await chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            return f"Pipeline {pipeline_id} not found"
        data = pipeline.to_dict()
        return json.dumps(data, indent=2, default=str)

    # Resources
    @mcp.resource("cortex://repo-map")
    async def resource_repo_map() -> str:
        """Repository structure map."""
        if context_engine is None:
            return "Context engine not configured"
        return await context_engine._build_repo_map() or "No repo map available"

    @mcp.resource("cortex://agents-md")
    async def resource_agents_md() -> str:
        """AGENTS.md content from the repository."""
        if context_engine is None:
            return "Context engine not configured"
        return await context_engine._load_agents_md() or "No AGENTS.md files found"

    logger.info("MCP server created with tools: get_repo_map, get_agents_md, get_constraints, build_full_context, list_pipelines, get_pipeline_status")
    return mcp
