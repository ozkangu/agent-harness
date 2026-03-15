"""CLI subprocess management with JSONL streaming for multiple backends."""

from __future__ import annotations

import abc
import asyncio
import json
import logging
import os
import signal
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from cortex.models import BackendConfig, BackendType

logger = logging.getLogger(__name__)

# Default binaries per backend
_DEFAULT_BINARIES: dict[BackendType, str] = {
    BackendType.CLAUDE: "claude",
    BackendType.COPILOT: "copilot",
    BackendType.CODEX: "codex",
}

# Default models per backend
_DEFAULT_MODELS: dict[BackendType, str] = {
    BackendType.CLAUDE: "sonnet",
    BackendType.COPILOT: "claude-sonnet-4",
    BackendType.CODEX: "",
}


@dataclass
class RunResult:
    """Result of a CLI run."""

    success: bool
    session_id: str | None = None
    output_lines: list[dict] = field(default_factory=list)
    raw_output: str = ""
    error: str | None = None
    exit_code: int | None = None


class BaseRunner(abc.ABC):
    """Abstract base for CLI backend runners."""

    def __init__(self, config: BackendConfig) -> None:
        self.config = config

    @abc.abstractmethod
    def build_args(
        self,
        prompt: str,
        *,
        session_id: str | None = None,
        workdir: str | None = None,
    ) -> list[str]:
        """Build the CLI argument list."""

    def _extract_session_id(self, parsed: dict) -> str | None:
        """Extract session_id from a parsed JSONL line. Override per backend."""
        return None

    def _get_binary(self) -> str:
        """Return the binary path, falling back to backend default."""
        return self.config.binary or _DEFAULT_BINARIES.get(
            self.config.backend, "claude"
        )

    def _get_model(self) -> str:
        """Return the model, falling back to backend default."""
        return self.config.model or _DEFAULT_MODELS.get(
            self.config.backend, ""
        )

    async def run(
        self,
        prompt: str,
        *,
        session_id: str | None = None,
        workdir: str | None = None,
        stall_timeout: int = 300,
        turn_timeout: int = 3600,
        env_extra: dict[str, str] | None = None,
        on_output: Callable[[dict], Awaitable[None]] | None = None,
        secret_values: list[str] | None = None,
    ) -> RunResult:
        """Execute the CLI and stream JSONL output."""
        args = self.build_args(prompt, session_id=session_id, workdir=workdir)
        logger.info("Running: %s", " ".join(args[:6]) + " ...")

        env = os.environ.copy()
        if env_extra:
            env.update(env_extra)

        # Build secret filter for output sanitization
        _secrets_to_filter = [v for v in (secret_values or []) if len(v) >= 4]

        result = RunResult(success=False)
        raw_lines: list[str] = []

        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workdir,
                env=env,
                start_new_session=True,
            )

            last_output_at = time.monotonic()
            start_time = time.monotonic()

            async def read_stream() -> None:
                nonlocal last_output_at
                assert process.stdout is not None
                async for line_bytes in process.stdout:
                    line = line_bytes.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue

                    raw_lines.append(line)
                    last_output_at = time.monotonic()

                    try:
                        parsed = json.loads(line)
                        result.output_lines.append(parsed)

                        # Capture session_id via backend-specific hook
                        sid = self._extract_session_id(parsed)
                        if sid:
                            result.session_id = sid
                            logger.debug("Captured session_id: %s", result.session_id)
                    except json.JSONDecodeError:
                        parsed = {"type": "raw", "content": line}
                        result.output_lines.append(parsed)

                    # Stream callback for real-time UI (filter secrets)
                    if on_output is not None:
                        try:
                            filtered = parsed
                            if _secrets_to_filter:
                                import copy
                                filtered = copy.deepcopy(parsed)
                                for key in ("content", "result", "message"):
                                    if key in filtered and isinstance(filtered[key], str):
                                        for sv in _secrets_to_filter:
                                            filtered[key] = filtered[key].replace(sv, "***")
                            await on_output(filtered)
                        except Exception:
                            logger.debug("on_output callback error", exc_info=True)

            async def monitor() -> None:
                """Monitor for stall and turn timeouts."""
                while process.returncode is None:
                    await asyncio.sleep(5)
                    elapsed = time.monotonic() - start_time
                    stall = time.monotonic() - last_output_at

                    if stall > stall_timeout:
                        logger.warning("Stall timeout reached (%ds)", stall_timeout)
                        _kill_process_group(process)
                        return

                    if elapsed > turn_timeout:
                        logger.warning("Turn timeout reached (%ds)", turn_timeout)
                        _kill_process_group(process)
                        return

            reader_task = asyncio.create_task(read_stream())
            monitor_task = asyncio.create_task(monitor())

            try:
                await process.wait()
            finally:
                monitor_task.cancel()
                try:
                    await monitor_task
                except asyncio.CancelledError:
                    pass
                await reader_task

            # Read stderr
            stderr_data = b""
            if process.stderr:
                stderr_data = await process.stderr.read()

            result.exit_code = process.returncode
            result.raw_output = "\n".join(raw_lines)

            if process.returncode == 0:
                result.success = True
            else:
                stderr_text = stderr_data.decode("utf-8", errors="replace").strip()
                result.error = stderr_text or f"Process exited with code {process.returncode}"
                logger.error("CLI failed (exit %d): %s", process.returncode, result.error)

        except FileNotFoundError:
            binary = self._get_binary()
            result.error = f"CLI binary not found: {binary}"
            logger.error(result.error)
        except Exception as exc:
            result.error = str(exc)
            logger.exception("Unexpected error running CLI")

        return result


class ClaudeRunner(BaseRunner):
    """Claude Code CLI runner."""

    def build_args(
        self,
        prompt: str,
        *,
        session_id: str | None = None,
        workdir: str | None = None,
    ) -> list[str]:
        binary = self._get_binary()
        model = self._get_model()
        args = [binary]

        if session_id:
            args.extend(["--resume", session_id])
        else:
            args.extend(["-p", prompt])

        args.extend([
            "--output-format", "stream-json",
            "--verbose",
            "--model", model,
            "--dangerously-skip-permissions",
        ])

        if self.config.budget_usd is not None:
            args.extend(["--max-budget-usd", str(self.config.budget_usd)])

        if self.config.agent:
            args.extend(["--agent", self.config.agent])

        if self.config.deny_tools:
            args.extend(["--disallowed-tools", ",".join(self.config.deny_tools)])

        if self.config.allow_tools:
            args.extend(["--allowed-tools", ",".join(self.config.allow_tools)])

        if self.config.extra_args:
            args.extend(self.config.extra_args)

        return args

    def _extract_session_id(self, parsed: dict) -> str | None:
        if parsed.get("type") == "system":
            return parsed.get("session_id") or parsed.get("data", {}).get("session_id")
        return None


class CopilotCLIRunner(BaseRunner):
    """GitHub Copilot CLI runner."""

    def build_args(
        self,
        prompt: str,
        *,
        session_id: str | None = None,
        workdir: str | None = None,
    ) -> list[str]:
        binary = self._get_binary()
        model = self._get_model()
        args = [binary]

        if session_id:
            args.extend(["--resume", session_id])
        else:
            args.append(prompt)

        if model:
            args.extend(["--model", model])

        args.append("--allow-all")

        if self.config.extra_args:
            args.extend(self.config.extra_args)

        return args

    def _extract_session_id(self, parsed: dict) -> str | None:
        if parsed.get("type") in ("system", "init"):
            return parsed.get("session_id") or parsed.get("id")
        return None


class CodexRunner(BaseRunner):
    """OpenAI Codex CLI runner."""

    def build_args(
        self,
        prompt: str,
        *,
        session_id: str | None = None,
        workdir: str | None = None,
    ) -> list[str]:
        binary = self._get_binary()
        model = self._get_model()
        args = [binary, "exec"]

        if session_id:
            args.extend(["resume", "--last", "--json"])
        else:
            args.extend([prompt, "--json"])

        if model:
            args.extend(["--model", model])

        args.append("--full-auto")

        if self.config.sandbox_mode:
            args.extend(["-s", self.config.sandbox_mode])

        if workdir:
            args.extend(["--cd", workdir])

        args.append("--skip-git-repo-check")

        if self.config.extra_args:
            args.extend(self.config.extra_args)

        return args

    def _extract_session_id(self, parsed: dict) -> str | None:
        if parsed.get("type") in ("system", "session"):
            return parsed.get("session_id") or parsed.get("id")
        return None


def create_runner(config: BackendConfig) -> BaseRunner:
    """Factory: create the appropriate runner for the given config."""
    runners: dict[BackendType, type[BaseRunner]] = {
        BackendType.CLAUDE: ClaudeRunner,
        BackendType.COPILOT: CopilotCLIRunner,
        BackendType.CODEX: CodexRunner,
    }
    runner_cls = runners.get(config.backend)
    if runner_cls is None:
        raise ValueError(f"Unknown backend: {config.backend!r}")
    return runner_cls(config)


def _kill_process_group(process: asyncio.subprocess.Process) -> None:
    """Kill the entire process group."""
    if process.pid is None:
        return
    try:
        os.killpg(os.getpgid(process.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        pass


# Backward compatibility alias
CopilotRunner = ClaudeRunner
