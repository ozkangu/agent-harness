"""Tests for CLI runner backends."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from maestro.models import BackendConfig, BackendType, CopilotConfig
from maestro.runner import (
    BaseRunner,
    ClaudeRunner,
    CodexRunner,
    CopilotCLIRunner,
    CopilotRunner,
    RunResult,
    create_runner,
)


# --- ClaudeRunner tests ---


class TestClaudeRunner:
    def test_build_args_basic(self) -> None:
        config = BackendConfig(
            backend=BackendType.CLAUDE,
            binary="claude",
            model="sonnet",
            agent="maestro-worker",
            max_autopilot_continues=50,
            deny_tools=["shell(rm -rf *)"],
        )
        runner = ClaudeRunner(config)
        args = runner.build_args("Do the task")

        assert args[0] == "claude"
        assert "-p" in args
        assert "Do the task" in args
        assert "--output-format" in args
        assert "stream-json" in args
        assert "--verbose" in args
        assert "--model" in args
        assert "sonnet" in args
        assert "--dangerously-skip-permissions" in args
        assert "--agent" in args
        assert "maestro-worker" in args
        assert "--disallowed-tools" in args
        assert "shell(rm -rf *)" in args

    def test_build_args_resume_session(self) -> None:
        config = BackendConfig(backend=BackendType.CLAUDE, binary="claude")
        runner = ClaudeRunner(config)
        args = runner.build_args("prompt", session_id="session-123")

        assert "--resume" in args
        assert "session-123" in args
        assert "-p" not in args

    def test_build_args_no_agent(self) -> None:
        config = BackendConfig(backend=BackendType.CLAUDE, binary="claude", agent="")
        runner = ClaudeRunner(config)
        args = runner.build_args("prompt")
        assert "--agent" not in args

    def test_build_args_allow_tools(self) -> None:
        config = BackendConfig(
            backend=BackendType.CLAUDE,
            binary="claude",
            allow_tools=["Bash(npm test)"],
        )
        runner = ClaudeRunner(config)
        args = runner.build_args("prompt")
        assert "--allowed-tools" in args
        assert "Bash(npm test)" in args

    def test_build_args_budget_usd(self) -> None:
        config = BackendConfig(
            backend=BackendType.CLAUDE, binary="claude", budget_usd=10.0
        )
        runner = ClaudeRunner(config)
        args = runner.build_args("prompt")
        assert "--max-budget-usd" in args
        idx = args.index("--max-budget-usd")
        assert args[idx + 1] == "10.0"

    def test_build_args_budget_default(self) -> None:
        config = BackendConfig(backend=BackendType.CLAUDE, binary="claude")
        runner = ClaudeRunner(config)
        args = runner.build_args("prompt")
        assert "--max-budget-usd" not in args

    def test_build_args_extra_args(self) -> None:
        config = BackendConfig(
            backend=BackendType.CLAUDE,
            binary="claude",
            extra_args=["--verbose", "--debug"],
        )
        runner = ClaudeRunner(config)
        args = runner.build_args("prompt")
        assert "--verbose" in args
        assert "--debug" in args

    def test_extract_session_id(self) -> None:
        config = BackendConfig(backend=BackendType.CLAUDE)
        runner = ClaudeRunner(config)
        assert runner._extract_session_id({"type": "system", "session_id": "abc"}) == "abc"
        assert runner._extract_session_id({"type": "system", "data": {"session_id": "def"}}) == "def"
        assert runner._extract_session_id({"type": "assistant"}) is None

    def test_default_binary(self) -> None:
        config = BackendConfig(backend=BackendType.CLAUDE)
        runner = ClaudeRunner(config)
        assert runner._get_binary() == "claude"

    def test_default_model(self) -> None:
        config = BackendConfig(backend=BackendType.CLAUDE)
        runner = ClaudeRunner(config)
        assert runner._get_model() == "sonnet"


# --- CopilotCLIRunner tests ---


class TestCopilotCLIRunner:
    def test_build_args_basic(self) -> None:
        config = BackendConfig(
            backend=BackendType.COPILOT,
            binary="copilot",
            model="claude-sonnet-4",
        )
        runner = CopilotCLIRunner(config)
        args = runner.build_args("Implement feature X")

        assert args[0] == "copilot"
        assert "Implement feature X" in args
        assert "--model" in args
        assert "claude-sonnet-4" in args
        assert "--allow-all" in args
        # Claude-only flags must NOT be present
        assert "-p" not in args
        assert "--dangerously-skip-permissions" not in args
        assert "--output-format" not in args
        assert "--agent" not in args

    def test_build_args_resume(self) -> None:
        config = BackendConfig(backend=BackendType.COPILOT, binary="copilot")
        runner = CopilotCLIRunner(config)
        args = runner.build_args("prompt", session_id="sess-456")
        assert "--resume" in args
        assert "sess-456" in args

    def test_extract_session_id(self) -> None:
        config = BackendConfig(backend=BackendType.COPILOT)
        runner = CopilotCLIRunner(config)
        assert runner._extract_session_id({"type": "system", "session_id": "s1"}) == "s1"
        assert runner._extract_session_id({"type": "init", "id": "i1"}) == "i1"
        assert runner._extract_session_id({"type": "assistant"}) is None

    def test_default_binary(self) -> None:
        config = BackendConfig(backend=BackendType.COPILOT)
        runner = CopilotCLIRunner(config)
        assert runner._get_binary() == "copilot"

    def test_default_model(self) -> None:
        config = BackendConfig(backend=BackendType.COPILOT)
        runner = CopilotCLIRunner(config)
        assert runner._get_model() == "claude-sonnet-4"


# --- CodexRunner tests ---


class TestCodexRunner:
    def test_build_args_basic(self) -> None:
        config = BackendConfig(
            backend=BackendType.CODEX,
            binary="codex",
            model="gpt-5.4",
            sandbox_mode="danger-full-access",
        )
        runner = CodexRunner(config)
        args = runner.build_args("Fix the bug", workdir="/home/project")

        assert args[0] == "codex"
        assert args[1] == "exec"
        assert "Fix the bug" in args
        assert "--json" in args
        assert "--model" in args
        assert "gpt-5.4" in args
        assert "--full-auto" in args
        assert "-s" in args
        assert "danger-full-access" in args
        assert "--cd" in args
        assert "/home/project" in args
        assert "--skip-git-repo-check" in args

    def test_build_args_resume(self) -> None:
        config = BackendConfig(backend=BackendType.CODEX, binary="codex")
        runner = CodexRunner(config)
        args = runner.build_args("prompt", session_id="sess-789")

        assert "resume" in args
        assert "--last" in args
        assert "--json" in args
        # Prompt not passed when resuming
        assert "prompt" not in args

    def test_build_args_no_sandbox(self) -> None:
        config = BackendConfig(backend=BackendType.CODEX, binary="codex")
        runner = CodexRunner(config)
        args = runner.build_args("test")
        assert "-s" not in args

    def test_build_args_no_workdir(self) -> None:
        config = BackendConfig(backend=BackendType.CODEX, binary="codex")
        runner = CodexRunner(config)
        args = runner.build_args("test")
        assert "--cd" not in args
        assert "--skip-git-repo-check" in args

    def test_extract_session_id(self) -> None:
        config = BackendConfig(backend=BackendType.CODEX)
        runner = CodexRunner(config)
        assert runner._extract_session_id({"type": "system", "session_id": "s1"}) == "s1"
        assert runner._extract_session_id({"type": "session", "id": "i1"}) == "i1"
        assert runner._extract_session_id({"type": "assistant"}) is None

    def test_default_binary(self) -> None:
        config = BackendConfig(backend=BackendType.CODEX)
        runner = CodexRunner(config)
        assert runner._get_binary() == "codex"

    def test_default_model(self) -> None:
        config = BackendConfig(backend=BackendType.CODEX)
        runner = CodexRunner(config)
        assert runner._get_model() == "o4-mini"


# --- Factory tests ---


class TestRunnerFactory:
    def test_create_claude_runner(self) -> None:
        config = BackendConfig(backend=BackendType.CLAUDE)
        runner = create_runner(config)
        assert isinstance(runner, ClaudeRunner)

    def test_create_copilot_runner(self) -> None:
        config = BackendConfig(backend=BackendType.COPILOT)
        runner = create_runner(config)
        assert isinstance(runner, CopilotCLIRunner)

    def test_create_codex_runner(self) -> None:
        config = BackendConfig(backend=BackendType.CODEX)
        runner = create_runner(config)
        assert isinstance(runner, CodexRunner)


# --- Backward compatibility tests ---


class TestBackwardCompat:
    def test_copilot_runner_alias(self) -> None:
        assert CopilotRunner is ClaudeRunner

    def test_copilot_config_alias(self) -> None:
        assert CopilotConfig is BackendConfig

    def test_copilot_runner_works(self) -> None:
        config = CopilotConfig(binary="claude", model="sonnet", agent="worker")
        runner = CopilotRunner(config)
        args = runner.build_args("test")
        assert args[0] == "claude"
        assert "--model" in args


# --- Run integration tests ---


@pytest.mark.asyncio
async def test_run_success() -> None:
    config = BackendConfig(backend=BackendType.CLAUDE, binary="echo")
    runner = ClaudeRunner(config)

    jsonl_output = json.dumps({"type": "system", "session_id": "sess-abc"}) + "\n"
    jsonl_output += json.dumps({"type": "assistant", "message": {"content": "Done"}}) + "\n"

    with patch("asyncio.create_subprocess_exec") as mock_exec:
        mock_proc = AsyncMock()
        mock_proc.pid = 12345
        mock_proc.returncode = 0
        mock_proc.wait = AsyncMock(return_value=0)

        async def stdout_iter():
            for line in jsonl_output.encode().split(b"\n"):
                if line:
                    yield line + b"\n"

        mock_proc.stdout = stdout_iter()
        mock_proc.stderr = AsyncMock()
        mock_proc.stderr.read = AsyncMock(return_value=b"")

        mock_exec.return_value = mock_proc

        result = await runner.run("Do task", stall_timeout=60, turn_timeout=120)

    assert result.success
    assert result.session_id == "sess-abc"
    assert len(result.output_lines) == 2


@pytest.mark.asyncio
async def test_run_binary_not_found() -> None:
    config = BackendConfig(
        backend=BackendType.CLAUDE, binary="/nonexistent/binary"
    )
    runner = ClaudeRunner(config)

    result = await runner.run("test prompt", stall_timeout=5, turn_timeout=10)
    assert not result.success
    assert "not found" in (result.error or "").lower()


def test_run_result_defaults() -> None:
    result = RunResult(success=False)
    assert result.session_id is None
    assert result.output_lines == []
    assert result.raw_output == ""
    assert result.error is None
    assert result.exit_code is None
