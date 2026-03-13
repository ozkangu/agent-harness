"""Context engine: AGENTS.md loading, repo map, constraint assembly."""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path

from maestro.chat import ChatStore

logger = logging.getLogger(__name__)

# Max depth for repo tree
_TREE_MAX_DEPTH = 3
_TREE_MAX_ENTRIES = 200

# Directories to skip in repo map
_SKIP_DIRS = {
    ".git", ".venv", "venv", "node_modules", "__pycache__",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", "dist", "build",
    ".tox", ".eggs", "*.egg-info",
}

# Constraint file patterns
_CONSTRAINT_FILES = [
    ".pre-commit-config.yaml",
    "pyproject.toml",
    "setup.cfg",
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    "tsconfig.json",
    ".flake8",
    "ruff.toml",
]


class ContextEngine:
    """Assembles enriched context from AGENTS.md files, repo structure, and constraints."""

    def __init__(
        self,
        chat_store: ChatStore,
        repo_dir: str | Path | None = None,
        db=None,
    ) -> None:
        self.chat_store = chat_store
        self.repo_dir = Path(repo_dir) if repo_dir else None
        self.db = db
        self._cache: dict[str, str] = {}

    async def build_context(
        self,
        *,
        issue=None,
        conversation_id: int | None = None,
        include_agents_md: bool = True,
        include_repo_map: bool = True,
        include_constraints: bool = True,
        target_modules: list[str] | None = None,
    ) -> str:
        """Assemble full context string for an agent prompt."""
        sections: list[str] = []

        if include_agents_md:
            agents_md = await self._load_agents_md(target_modules=target_modules)
            if agents_md:
                sections.append("## Project Guidelines (AGENTS.md)\n" + agents_md)

        if include_repo_map:
            repo_map = await self._build_repo_map()
            if repo_map:
                sections.append("## Repository Structure\n```\n" + repo_map + "\n```")

        if include_constraints:
            constraints = await self._load_constraints()
            if constraints:
                sections.append("## Project Constraints\n" + constraints)

        if issue and hasattr(issue, "error_log") and issue.error_log:
            feedback = await self._build_failure_feedback(issue)
            if feedback:
                sections.append("## Previous Failure Analysis\n" + feedback)

        return "\n\n".join(sections)

    async def _load_agents_md(self, target_modules: list[str] | None = None) -> str:
        """Load AGENTS.md files from the repo."""
        if self.repo_dir is None:
            return ""

        files = await self.scan_agents_md_files()
        if not files:
            return ""

        parts: list[str] = []

        # Root AGENTS.md first
        root_files = [f for f in files if f.get("is_root")]
        module_files = [f for f in files if not f.get("is_root")]

        for f in root_files:
            parts.append(f["content"])

        # Filter module files if target specified
        if target_modules:
            module_files = [
                f for f in module_files
                if any(mod in f["path"] for mod in target_modules)
            ]

        for f in module_files:
            parts.append(f"### {f['path']}\n{f['content']}")

        return "\n\n".join(parts)

    async def _build_repo_map(self) -> str:
        """Build a short tree representation of the repo."""
        if self.repo_dir is None or not self.repo_dir.exists():
            return ""

        cache_key = "repo_map"
        if cache_key in self._cache:
            return self._cache[cache_key]

        lines: list[str] = []
        entry_count = 0

        def _walk(path: Path, prefix: str, depth: int) -> None:
            nonlocal entry_count
            if depth > _TREE_MAX_DEPTH or entry_count > _TREE_MAX_ENTRIES:
                return

            try:
                entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name))
            except PermissionError:
                return

            dirs = [e for e in entries if e.is_dir() and e.name not in _SKIP_DIRS]
            files = [e for e in entries if e.is_file()]

            for f in files:
                if entry_count >= _TREE_MAX_ENTRIES:
                    lines.append(f"{prefix}... (truncated)")
                    return
                lines.append(f"{prefix}{f.name}")
                entry_count += 1

            for d in dirs:
                if entry_count >= _TREE_MAX_ENTRIES:
                    lines.append(f"{prefix}... (truncated)")
                    return
                lines.append(f"{prefix}{d.name}/")
                entry_count += 1
                _walk(d, prefix + "  ", depth + 1)

        _walk(self.repo_dir, "", 0)
        result = "\n".join(lines)
        self._cache[cache_key] = result
        return result

    async def _load_constraints(self) -> str:
        """Load project constraint files (linter configs, etc.)."""
        if self.repo_dir is None:
            return ""

        cache_key = "constraints"
        if cache_key in self._cache:
            return self._cache[cache_key]

        parts: list[str] = []
        for filename in _CONSTRAINT_FILES:
            filepath = self.repo_dir / filename
            if filepath.exists():
                try:
                    content = filepath.read_text(encoding="utf-8")
                    # Only include first 2000 chars of each constraint file
                    if len(content) > 2000:
                        content = content[:2000] + "\n... (truncated)"
                    parts.append(f"### {filename}\n```\n{content}\n```")
                except Exception:
                    logger.debug("Failed to read constraint file: %s", filepath)

        result = "\n\n".join(parts)
        self._cache[cache_key] = result
        return result

    async def _build_failure_feedback(self, issue) -> str:
        """Build failure analysis from an issue's error log."""
        if not issue or not issue.error_log:
            return ""
        return (
            f"The previous attempt failed with the following error:\n"
            f"```\n{issue.error_log[:3000]}\n```\n"
            f"Please analyze this error and address the root cause."
        )

    async def scan_agents_md_files(self) -> list[dict]:
        """Find all AGENTS.md files in the repo."""
        if self.repo_dir is None or not self.repo_dir.exists():
            return []

        results: list[dict] = []

        for root, dirs, files in os.walk(str(self.repo_dir)):
            # Skip hidden and common non-source dirs
            dirs[:] = [d for d in dirs if d not in _SKIP_DIRS and not d.startswith(".")]

            for fname in files:
                if fname.upper() == "AGENTS.MD":
                    filepath = Path(root) / fname
                    try:
                        content = filepath.read_text(encoding="utf-8")
                        rel_path = str(filepath.relative_to(self.repo_dir))
                        version_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
                        is_root = filepath.parent == self.repo_dir
                        results.append({
                            "path": rel_path,
                            "content": content,
                            "doc_type": "agents_md",
                            "version_hash": version_hash,
                            "is_root": is_root,
                        })
                    except Exception:
                        logger.debug("Failed to read AGENTS.md: %s", filepath)

        return results

    async def update_context_cache(self) -> None:
        """Clear and rebuild the context cache."""
        self._cache.clear()
        await self._build_repo_map()
        await self._load_constraints()
        logger.info("Context cache refreshed")
