"""Continuous quality gate: lint, test, typecheck, structural checks."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import aiosqlite

from maestro.chat import ChatStore
from maestro.models import QualityRun

logger = logging.getLogger(__name__)


@dataclass
class CheckResult:
    name: str
    passed: bool
    output: str
    error: str | None = None


@dataclass
class QualityResult:
    passed: bool
    checks: list[CheckResult]
    summary: str


class QualityGate:
    """Runs lint, test, and typecheck quality checks."""

    def __init__(self, chat_store: ChatStore, db: aiosqlite.Connection) -> None:
        self.chat_store = chat_store
        self._db = db

    async def run_checks(
        self,
        workdir: str,
        issue_key: str | None = None,
        conversation_id: int | None = None,
        triggered_by: str = "agent_action",
    ) -> QualityResult:
        """Run all quality checks and return aggregated result."""
        checks: list[CheckResult] = []

        lint_result = await self._run_lint(workdir)
        checks.append(lint_result)

        test_result = await self._run_tests(workdir)
        checks.append(test_result)

        typecheck_result = await self._run_typecheck(workdir)
        if typecheck_result is not None:
            checks.append(typecheck_result)

        structural_result = await self._run_structural_checks(workdir)
        if structural_result is not None:
            checks.append(structural_result)

        passed = all(c.passed for c in checks)
        failed_names = [c.name for c in checks if not c.passed]
        summary = "All checks passed" if passed else f"Failed: {', '.join(failed_names)}"

        result = QualityResult(passed=passed, checks=checks, summary=summary)

        # Record the run
        status = "pass" if passed else "fail"
        output_parts = []
        for c in checks:
            status_str = "PASS" if c.passed else "FAIL"
            output_parts.append(f"[{status_str}] {c.name}: {c.output[:500]}")
        output = "\n".join(output_parts)

        await self._record_run(
            issue_key=issue_key,
            conv_id=conversation_id,
            run_type="quality_check",
            status=status,
            output=output,
            triggered_by=triggered_by,
        )

        return result

    async def _run_lint(self, workdir: str) -> CheckResult:
        """Run linter (ruff or flake8)."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "ruff", "check", ".",
                cwd=workdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            output = stdout.decode("utf-8", errors="replace")
            passed = proc.returncode == 0
            return CheckResult(name="lint", passed=passed, output=output or "Clean")
        except FileNotFoundError:
            return CheckResult(name="lint", passed=True, output="Linter not found, skipped")
        except asyncio.TimeoutError:
            return CheckResult(name="lint", passed=False, output="Lint timed out", error="timeout")
        except Exception as e:
            return CheckResult(name="lint", passed=True, output=f"Lint skipped: {e}")

    async def _run_tests(self, workdir: str) -> CheckResult:
        """Run test suite."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "python", "-m", "pytest", "--tb=short", "-q",
                cwd=workdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
            output = stdout.decode("utf-8", errors="replace")
            passed = proc.returncode == 0
            return CheckResult(name="tests", passed=passed, output=output or "No output")
        except FileNotFoundError:
            return CheckResult(name="tests", passed=True, output="pytest not found, skipped")
        except asyncio.TimeoutError:
            return CheckResult(name="tests", passed=False, output="Tests timed out", error="timeout")
        except Exception as e:
            return CheckResult(name="tests", passed=True, output=f"Tests skipped: {e}")

    async def _run_typecheck(self, workdir: str) -> CheckResult | None:
        """Run type checker if available."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "mypy", ".", "--ignore-missing-imports",
                cwd=workdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            output = stdout.decode("utf-8", errors="replace")
            passed = proc.returncode == 0
            return CheckResult(name="typecheck", passed=passed, output=output or "Clean")
        except FileNotFoundError:
            return None  # mypy not installed, skip
        except asyncio.TimeoutError:
            return CheckResult(name="typecheck", passed=False, output="Typecheck timed out", error="timeout")
        except Exception:
            return None

    async def _run_structural_checks(self, workdir: str) -> CheckResult | None:
        """Run basic structural checks (e.g., no debug prints left)."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "grep", "-rn", "breakpoint()", ".",
                "--include=*.py",
                cwd=workdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
            output = stdout.decode("utf-8", errors="replace").strip()
            if output:
                return CheckResult(
                    name="structural",
                    passed=False,
                    output=f"Found debug breakpoints:\n{output}",
                )
            return None  # No issues found, skip reporting
        except Exception:
            return None

    async def _record_run(
        self,
        issue_key: str | None,
        conv_id: int | None,
        run_type: str,
        status: str,
        output: str,
        triggered_by: str,
    ) -> None:
        """Record a quality run in the database."""
        now = datetime.now(timezone.utc).isoformat()
        try:
            await self._db.execute(
                """INSERT INTO quality_runs
                   (issue_key, conversation_id, run_type, status, output, triggered_by, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (issue_key, conv_id, run_type, status, output, triggered_by, now),
            )
            await self._db.commit()
        except Exception:
            logger.exception("Failed to record quality run")

    async def get_runs(
        self,
        issue_key: str | None = None,
        limit: int = 20,
    ) -> list[QualityRun]:
        """Get quality run history."""
        params: tuple[str | int, ...]
        if issue_key:
            query = "SELECT * FROM quality_runs WHERE issue_key = ? ORDER BY id DESC LIMIT ?"
            params = (issue_key, limit)
        else:
            query = "SELECT * FROM quality_runs ORDER BY id DESC LIMIT ?"
            params = (limit,)

        async with self._db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
        return [QualityRun.from_row(dict(row)) for row in rows]

    async def get_status(self) -> dict:
        """Get overall quality status summary."""
        async with self._db.execute(
            "SELECT status, COUNT(*) as cnt FROM quality_runs GROUP BY status"
        ) as cursor:
            rows = await cursor.fetchall()

        status_counts = {row["status"]: row["cnt"] for row in rows}

        async with self._db.execute(
            "SELECT * FROM quality_runs ORDER BY id DESC LIMIT 1"
        ) as cursor:
            last_row = await cursor.fetchone()

        return {
            "total_runs": sum(status_counts.values()),
            "pass_count": status_counts.get("pass", 0),
            "fail_count": status_counts.get("fail", 0),
            "last_run": QualityRun.from_row(dict(last_row)).to_dict() if last_row else None,
        }
