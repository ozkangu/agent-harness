"""Entropy manager: manual codebase health scanning and maintenance task detection."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from maestro.board import Board
from maestro.chat import ChatStore
from maestro.models import EntropyTask

logger = logging.getLogger(__name__)


class EntropyManager:
    """Scans the codebase for entropy (staleness, dead code, inconsistencies).

    No automatic scheduling — scans are triggered manually via API.
    """

    def __init__(
        self,
        runner=None,
        context_engine=None,
        quality_gate=None,
        chat_store: ChatStore | None = None,
        board: Board | None = None,
        workdir: str | Path | None = None,
        db: aiosqlite.Connection | None = None,
    ) -> None:
        self.runner = runner
        self.context_engine = context_engine
        self.quality_gate = quality_gate
        self.chat_store = chat_store
        self.board = board
        self.workdir = Path(workdir) if workdir else None
        self._db = db

    async def run_scan(self) -> list[EntropyTask]:
        """Run a full entropy scan. Returns list of findings as EntropyTask objects."""
        findings: list[EntropyTask] = []

        checks = [
            self._check_context_freshness,
            self._check_dead_code,
            self._check_consistency,
            self._check_doc_staleness,
            self._check_dependency_health,
        ]

        for check in checks:
            try:
                result = await check()
                if result:
                    findings.extend(result)
            except Exception:
                logger.exception("Entropy check failed: %s", check.__name__)

        return findings

    async def _check_context_freshness(self) -> list[EntropyTask]:
        """Check if AGENTS.md files are up to date."""
        findings: list[EntropyTask] = []

        if self.context_engine is None:
            return findings

        try:
            files = await self.context_engine.scan_agents_md_files()
            if not files:
                task = await self._record_finding(
                    task_type="context_freshness",
                    description="No AGENTS.md files found in the repository",
                    findings="Consider creating AGENTS.md files to document project conventions.",
                )
                findings.append(task)
        except Exception:
            logger.debug("Context freshness check failed")

        return findings

    async def _check_dead_code(self) -> list[EntropyTask]:
        """Check for potential dead code indicators."""
        findings: list[EntropyTask] = []

        if self.workdir is None or not self.workdir.exists():
            return findings

        try:
            # Check for TODO/FIXME/HACK comments
            proc = await asyncio.create_subprocess_exec(
                "grep", "-rn", "-E", "TODO|FIXME|HACK|XXX", ".",
                "--include=*.py",
                cwd=str(self.workdir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
            output = stdout.decode("utf-8", errors="replace").strip()

            if output:
                lines = output.split("\n")
                task = await self._record_finding(
                    task_type="dead_code",
                    description=f"Found {len(lines)} TODO/FIXME/HACK comments",
                    findings=output[:3000],
                )
                findings.append(task)
        except Exception:
            logger.debug("Dead code check failed")

        return findings

    async def _check_consistency(self) -> list[EntropyTask]:
        """Check for style/convention inconsistencies."""
        findings: list[EntropyTask] = []

        if self.workdir is None or not self.workdir.exists():
            return findings

        try:
            # Run linter to find issues
            proc = await asyncio.create_subprocess_exec(
                "ruff", "check", ".", "--statistics",
                cwd=str(self.workdir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
            output = stdout.decode("utf-8", errors="replace").strip()

            if output and proc.returncode != 0:
                task = await self._record_finding(
                    task_type="consistency",
                    description="Linter found code style issues",
                    findings=output[:3000],
                )
                findings.append(task)
        except FileNotFoundError:
            pass  # ruff not installed
        except Exception:
            logger.debug("Consistency check failed")

        return findings

    async def _check_doc_staleness(self) -> list[EntropyTask]:
        """Check for potentially stale documentation."""
        findings: list[EntropyTask] = []

        if self.workdir is None or not self.workdir.exists():
            return findings

        try:
            readme = self.workdir / "README.md"
            if readme.exists():
                stat = readme.stat()
                # If README hasn't been modified in 90 days
                import time
                age_days = (time.time() - stat.st_mtime) / 86400
                if age_days > 90:
                    task = await self._record_finding(
                        task_type="doc_staleness",
                        description=f"README.md hasn't been updated in {int(age_days)} days",
                        findings="Consider reviewing and updating README.md",
                    )
                    findings.append(task)
        except Exception:
            logger.debug("Doc staleness check failed")

        return findings

    async def _check_dependency_health(self) -> list[EntropyTask]:
        """Check dependency files for potential issues."""
        findings: list[EntropyTask] = []

        if self.workdir is None or not self.workdir.exists():
            return findings

        try:
            # Check for requirements.txt or pyproject.toml
            pyproject = self.workdir / "pyproject.toml"
            requirements = self.workdir / "requirements.txt"

            if not pyproject.exists() and not requirements.exists():
                task = await self._record_finding(
                    task_type="dependency_health",
                    description="No dependency manifest found (pyproject.toml or requirements.txt)",
                    findings="Consider adding a dependency manifest for reproducible builds.",
                )
                findings.append(task)
        except Exception:
            logger.debug("Dependency health check failed")

        return findings

    async def _record_finding(
        self, task_type: str, description: str, findings: str | None = None,
    ) -> EntropyTask:
        """Record an entropy finding in the database."""
        now = datetime.now(timezone.utc).isoformat()

        if self._db:
            try:
                cursor = await self._db.execute(
                    """INSERT INTO entropy_tasks
                       (task_type, status, description, findings, created_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (task_type, "open", description, findings, now),
                )
                await self._db.commit()
                task_id = cursor.lastrowid

                async with self._db.execute(
                    "SELECT * FROM entropy_tasks WHERE id = ?", (task_id,)
                ) as cur:
                    row = await cur.fetchone()
                    assert row is not None
                    return EntropyTask.from_row(dict(row))
            except Exception:
                logger.exception("Failed to record entropy finding")

        # Fallback: return in-memory object
        return EntropyTask(
            id=0,
            task_type=task_type,
            status="open",
            description=description,
            findings=findings,
            created_at=datetime.now(timezone.utc),
        )

    async def _create_maintenance_issue(self, title: str, description: str) -> None:
        """Create a maintenance issue on the board."""
        if self.board:
            await self.board.create_issue(
                title=title,
                description=description,
                priority="low",
                labels=["maintenance", "entropy"],
            )

    async def get_tasks(self) -> list[EntropyTask]:
        """Get all entropy tasks from the database."""
        if self._db is None:
            return []

        try:
            async with self._db.execute(
                "SELECT * FROM entropy_tasks ORDER BY id DESC"
            ) as cursor:
                rows = await cursor.fetchall()
            return [EntropyTask.from_row(dict(row)) for row in rows]
        except Exception:
            logger.exception("Failed to get entropy tasks")
            return []
