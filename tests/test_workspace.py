"""Tests for workspace management."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from cortex.models import HooksConfig, Issue, IssueStatus
from cortex.workspace import Workspace


@pytest.fixture
def sample_issue() -> Issue:
    return Issue(
        id=1,
        key="CTX-1",
        title="Test issue",
        description="description",
        status=IssueStatus.TODO,
        priority="medium",
        labels=[],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def test_workspace_init(sample_issue: Issue, tmp_path: Path) -> None:
    ws = Workspace(
        issue=sample_issue,
        repo_url="https://github.com/test/repo.git",
        default_branch="main",
        base_dir=str(tmp_path),
    )
    assert ws.branch_name == "agent/ctx-1"
    assert "cortex-ctx-1" in str(ws.workdir)


def test_workspace_branch_name(sample_issue: Issue) -> None:
    ws = Workspace(
        issue=sample_issue,
        repo_url="https://github.com/test/repo.git",
        default_branch="main",
    )
    assert ws.branch_name == "agent/ctx-1"


@pytest.mark.asyncio
async def test_workspace_run_hook_none(sample_issue: Issue) -> None:
    ws = Workspace(
        issue=sample_issue,
        repo_url="https://github.com/test/repo.git",
        default_branch="main",
    )
    # None hook should return True
    result = await ws._run_hook(None)
    assert result is True


@pytest.mark.asyncio
async def test_workspace_run_hook_success(sample_issue: Issue, tmp_path: Path) -> None:
    ws = Workspace(
        issue=sample_issue,
        repo_url="https://github.com/test/repo.git",
        default_branch="main",
        base_dir=str(tmp_path),
    )
    ws.workdir = tmp_path  # Use tmp_path as workdir

    result = await ws._run_hook("echo hello")
    assert result is True


@pytest.mark.asyncio
async def test_workspace_run_hook_failure(sample_issue: Issue, tmp_path: Path) -> None:
    ws = Workspace(
        issue=sample_issue,
        repo_url="https://github.com/test/repo.git",
        default_branch="main",
        base_dir=str(tmp_path),
    )
    ws.workdir = tmp_path

    result = await ws._run_hook("exit 1")
    assert result is False


@pytest.mark.asyncio
async def test_workspace_cleanup(sample_issue: Issue, tmp_path: Path) -> None:
    ws = Workspace(
        issue=sample_issue,
        repo_url="https://github.com/test/repo.git",
        default_branch="main",
        base_dir=str(tmp_path),
    )
    # Create the workdir
    ws.workdir.mkdir(parents=True, exist_ok=True)
    assert ws.workdir.exists()

    await ws.cleanup()
    assert not ws.workdir.exists()


@pytest.mark.asyncio
async def test_workspace_cleanup_nonexistent(sample_issue: Issue, tmp_path: Path) -> None:
    ws = Workspace(
        issue=sample_issue,
        repo_url="https://github.com/test/repo.git",
        default_branch="main",
        base_dir=str(tmp_path),
    )
    # Should not raise even if workdir doesn't exist
    await ws.cleanup()
