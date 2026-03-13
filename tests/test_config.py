"""Tests for WORKFLOW.md config parsing."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from maestro.config import (
    WorkflowLoader,
    load_workflow,
    parse_workflow,
    render_prompt,
    resolve_env_vars,
)
from maestro.models import BackendType, Issue, IssueStatus
from datetime import datetime, timezone


def test_resolve_env_vars_with_value() -> None:
    with patch.dict(os.environ, {"MY_TOKEN": "abc123"}):
        result = resolve_env_vars("token=${MY_TOKEN}")
        assert result == "token=abc123"


def test_resolve_env_vars_with_default() -> None:
    os.environ.pop("MISSING_VAR", None)
    result = resolve_env_vars("val=${MISSING_VAR:-fallback}")
    assert result == "val=fallback"


def test_resolve_env_vars_no_match() -> None:
    os.environ.pop("NOPE", None)
    result = resolve_env_vars("val=${NOPE}")
    assert result == "val=${NOPE}"


def test_parse_workflow(workflow_content: str) -> None:
    config = parse_workflow(workflow_content)
    assert config.copilot.backend == BackendType.CLAUDE
    assert config.copilot.binary == "claude"
    assert config.copilot.model == "sonnet"
    assert config.copilot.agent == "maestro-worker"
    assert config.copilot.max_autopilot_continues == 50
    assert "shell(rm -rf *)" in config.copilot.deny_tools
    assert config.orchestrator.repo_url == "https://github.com/test/repo.git"
    assert config.orchestrator.max_concurrent_agents == 2
    assert config.orchestrator.max_retries == 3
    assert config.orchestrator.web_port == 8421
    assert config.orchestrator.auto_approve is True
    assert config.orchestrator.max_inner_iterations == 3
    assert "test agent" in config.prompt_template


def test_parse_workflow_missing_frontmatter() -> None:
    with pytest.raises(ValueError, match="YAML frontmatter"):
        parse_workflow("no frontmatter here")


def test_load_workflow_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        load_workflow("/nonexistent/WORKFLOW.md")


def test_load_workflow_from_file(workflow_content: str, tmp_path: Path) -> None:
    wf = tmp_path / "WORKFLOW.md"
    wf.write_text(workflow_content)
    config = load_workflow(wf)
    assert config.copilot.model == "sonnet"


def test_render_prompt(workflow_content: str) -> None:
    config = parse_workflow(workflow_content)
    issue = Issue(
        id=1,
        key="MST-1",
        title="Fix bug",
        description="There is a bug",
        status=IssueStatus.TODO,
        priority="high",
        labels=["bug"],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        attempt_count=0,
    )
    prompt = render_prompt(config, issue)
    assert "MST-1" in prompt
    assert "Fix bug" in prompt
    assert "There is a bug" in prompt
    # No retry section for first attempt
    assert "Retry" not in prompt


def test_render_prompt_retry(workflow_content: str) -> None:
    config = parse_workflow(workflow_content)
    issue = Issue(
        id=1,
        key="MST-2",
        title="Retry task",
        description="desc",
        status=IssueStatus.TODO,
        priority="medium",
        labels=[],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        attempt_count=2,
        error_log="Previous failure reason",
    )
    prompt = render_prompt(config, issue)
    assert "Retry" in prompt
    assert "Previous failure reason" in prompt
    assert "3" in prompt  # attempt_count + 1


def test_workflow_loader_hot_reload(workflow_content: str, tmp_path: Path) -> None:
    wf = tmp_path / "WORKFLOW.md"
    wf.write_text(workflow_content)

    loader = WorkflowLoader(wf)
    config1 = loader.load()
    assert config1.orchestrator.max_concurrent_agents == 2

    # Modify file
    modified = workflow_content.replace("max_concurrent_agents: 2", "max_concurrent_agents: 5")
    wf.write_text(modified)

    # Force mtime change (some filesystems have 1s resolution)
    import time
    os.utime(wf, (time.time() + 1, time.time() + 1))

    config2 = loader.load()
    assert config2.orchestrator.max_concurrent_agents == 5


def test_workflow_loader_missing_file() -> None:
    loader = WorkflowLoader("/nonexistent/WORKFLOW.md")
    with pytest.raises(FileNotFoundError):
        loader.load()


def test_env_var_in_workflow(tmp_path: Path) -> None:
    content = """---
copilot:
  binary: "${COPILOT_BIN:-copilot}"
  model: "claude-opus-4-6"

orchestrator:
  repo_url: "https://github.com/test/repo.git"
---

Prompt template.
"""
    with patch.dict(os.environ, {"COPILOT_BIN": "/usr/local/bin/copilot"}):
        config = parse_workflow(content)
        assert config.copilot.binary == "/usr/local/bin/copilot"


def test_env_var_default_in_workflow() -> None:
    content = """---
copilot:
  binary: "${NONEXISTENT_BIN:-copilot}"
  model: "claude-opus-4-6"

orchestrator:
  repo_url: "https://github.com/test/repo.git"
---

Prompt.
"""
    os.environ.pop("NONEXISTENT_BIN", None)
    config = parse_workflow(content)
    assert config.copilot.binary == "copilot"


# --- Backend type parsing tests ---


def test_parse_backend_claude() -> None:
    content = """---
copilot:
  backend: "claude"
  model: "sonnet"
---

Prompt.
"""
    config = parse_workflow(content)
    assert config.copilot.backend == BackendType.CLAUDE


def test_parse_backend_copilot() -> None:
    content = """---
copilot:
  backend: "copilot"
  model: "claude-sonnet-4"
---

Prompt.
"""
    config = parse_workflow(content)
    assert config.copilot.backend == BackendType.COPILOT


def test_parse_backend_codex() -> None:
    content = """---
copilot:
  backend: "codex"
  model: "gpt-5.4"
  sandbox_mode: "danger-full-access"
---

Prompt.
"""
    config = parse_workflow(content)
    assert config.copilot.backend == BackendType.CODEX
    assert config.copilot.sandbox_mode == "danger-full-access"


def test_parse_backend_default_is_claude() -> None:
    content = """---
copilot:
  model: "sonnet"
---

Prompt.
"""
    config = parse_workflow(content)
    assert config.copilot.backend == BackendType.CLAUDE


def test_parse_unknown_backend_raises() -> None:
    content = """---
copilot:
  backend: "unknown-ai"
---

Prompt.
"""
    with pytest.raises(ValueError, match="Unknown backend"):
        parse_workflow(content)


def test_parse_budget_usd() -> None:
    content = """---
copilot:
  budget_usd: 10.5
---

Prompt.
"""
    config = parse_workflow(content)
    assert config.copilot.budget_usd == 10.5


def test_parse_budget_usd_default_none() -> None:
    content = """---
copilot:
  model: "sonnet"
---

Prompt.
"""
    config = parse_workflow(content)
    assert config.copilot.budget_usd is None


def test_workflow_loader_set_backend_resets_binary_and_model(tmp_path: Path) -> None:
    content = """---
copilot:
  backend: "claude"
  binary: "claude"
  model: "sonnet"
  agent: "maestro-worker"

orchestrator:
  repo_url: "https://github.com/test/repo.git"
---

Prompt.
"""
    wf = tmp_path / "WORKFLOW.md"
    wf.write_text(content)

    loader = WorkflowLoader(wf)
    cfg = loader.set_backend(BackendType.CODEX)

    assert cfg.copilot.backend == BackendType.CODEX
    assert cfg.copilot.binary == ""
    assert cfg.copilot.model == ""
    assert cfg.copilot.agent == "maestro-worker"


def test_workflow_loader_set_backend_uses_explicit_model(tmp_path: Path) -> None:
    content = """---
copilot:
  backend: "claude"
  binary: "claude"
  model: "sonnet"

orchestrator:
  repo_url: "https://github.com/test/repo.git"
---

Prompt.
"""
    wf = tmp_path / "WORKFLOW.md"
    wf.write_text(content)

    loader = WorkflowLoader(wf)
    cfg = loader.set_backend(BackendType.COPILOT, "claude-sonnet-4")

    assert cfg.copilot.backend == BackendType.COPILOT
    assert cfg.copilot.binary == ""
    assert cfg.copilot.model == "claude-sonnet-4"


def test_parse_extra_args() -> None:
    content = """---
copilot:
  extra_args:
    - "--verbose"
    - "--debug"
---

Prompt.
"""
    config = parse_workflow(content)
    assert config.copilot.extra_args == ["--verbose", "--debug"]
