"""Per-issue isolated git workspace management."""

from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
from pathlib import Path

from cortex.models import HooksConfig, Issue

logger = logging.getLogger(__name__)


class Workspace:
    """Manages an isolated git workspace for a single issue."""

    def __init__(
        self,
        issue: Issue,
        repo_url: str,
        default_branch: str,
        base_dir: str | None = None,
        hooks: HooksConfig | None = None,
    ) -> None:
        self.issue = issue
        self.repo_url = repo_url
        self.default_branch = default_branch
        self.hooks = hooks or HooksConfig()
        self._base_dir = base_dir or tempfile.gettempdir()
        self.workdir = Path(self._base_dir) / f"cortex-{issue.key.lower()}"
        self.branch_name = f"agent/{issue.key.lower()}"

    async def create(self) -> Path:
        """Clone the repo and create a feature branch."""
        if self.workdir.exists():
            shutil.rmtree(self.workdir)

        logger.info("Cloning %s into %s", self.repo_url, self.workdir)
        await self._run_cmd(
            "git", "clone", "--depth=1",
            "--branch", self.default_branch,
            self.repo_url, str(self.workdir),
        )

        logger.info("Creating branch %s", self.branch_name)
        await self._run_cmd(
            "git", "checkout", "-b", self.branch_name,
            cwd=str(self.workdir),
        )

        await self._run_hook(self.hooks.after_create)
        return self.workdir

    async def pre_run(self) -> None:
        """Execute before_run hook."""
        await self._run_hook(self.hooks.before_run)

    async def post_run(self) -> bool:
        """Execute after_run hook. Returns True if hook succeeded."""
        return await self._run_hook(self.hooks.after_run)

    async def cleanup(self) -> None:
        """Remove the workspace directory."""
        await self._run_hook(self.hooks.before_remove)
        if self.workdir.exists():
            logger.info("Cleaning up workspace %s", self.workdir)
            shutil.rmtree(self.workdir, ignore_errors=True)

    async def _run_hook(self, command: str | None) -> bool:
        """Run a shell hook command in the workspace directory. Returns True on success."""
        if not command:
            return True

        logger.info("Running hook: %s (in %s)", command, self.workdir)
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                cwd=str(self.workdir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                logger.error(
                    "Hook failed (exit %d): %s\nstderr: %s",
                    proc.returncode,
                    command,
                    stderr.decode("utf-8", errors="replace"),
                )
                return False
            return True
        except Exception:
            logger.exception("Hook execution error: %s", command)
            return False

    async def _run_cmd(self, *args: str, cwd: str | None = None) -> str:
        """Run a command and return stdout."""
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error = stderr.decode("utf-8", errors="replace")
            raise RuntimeError(f"Command failed: {' '.join(args)}\n{error}")

        return stdout.decode("utf-8", errors="replace")
