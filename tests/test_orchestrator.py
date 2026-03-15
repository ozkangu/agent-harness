"""Tests for the orchestrator poll loop and state machine."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from cortex.board import Board
from cortex.config import WorkflowLoader, parse_workflow
from cortex.models import IssueStatus, CortexConfig
from cortex.orchestrator import ActiveRun, Orchestrator
from cortex.runner import RunResult
from cortex.workspace import Workspace


pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def orchestrator(board: Board, workflow_content: str, tmp_path: Path):
    """Create an orchestrator with a mock workflow."""
    wf = tmp_path / "WORKFLOW.md"
    wf.write_text(workflow_content)
    loader = WorkflowLoader(wf)
    orch = Orchestrator(board, loader)
    orch._poll_interval = 0.1  # Fast polling for tests
    return orch


async def test_should_dispatch_first_attempt(orchestrator: Orchestrator, board: Board) -> None:
    issue = await board.create_issue("Test task")
    cfg = orchestrator.config
    assert await orchestrator._should_dispatch(issue, cfg) is True


async def test_should_not_dispatch_max_retries(orchestrator: Orchestrator, board: Board) -> None:
    issue = await board.create_issue("Test task")
    await board.update_issue(issue.key, attempt_count=3)
    issue = await board.get_issue(issue.key)
    assert issue is not None
    cfg = orchestrator.config
    assert await orchestrator._should_dispatch(issue, cfg) is False


async def test_should_not_dispatch_with_unmet_dependencies(
    orchestrator: Orchestrator, board: Board
) -> None:
    dep = await board.create_issue("Dependency")
    issue = await board.create_issue("Blocked", depends_on=[dep.key])
    cfg = orchestrator.config

    assert await orchestrator._should_dispatch(issue, cfg) is False

    refreshed = await board.get_issue(issue.key)
    assert refreshed is not None
    assert refreshed.blocked_reason is not None


async def test_tick_skips_blocked_issue_and_dispatches_ready_one(
    orchestrator: Orchestrator, board: Board
) -> None:
    dep = await board.create_issue("Dependency")
    blocked = await board.create_issue("Blocked", depends_on=[dep.key])
    ready = await board.create_issue("Ready")

    with patch.object(orchestrator, "_dispatch", new_callable=AsyncMock) as mock_dispatch:
        await orchestrator._tick()

    dispatched_keys = [call.args[0].key for call in mock_dispatch.await_args_list]
    assert ready.key in dispatched_keys
    assert blocked.key not in dispatched_keys


async def test_dispatch_changes_status(orchestrator: Orchestrator, board: Board) -> None:
    issue = await board.create_issue("Dispatch test")
    cfg = orchestrator.config

    with patch.object(orchestrator, "_run_agent", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = RunResult(success=True)
        await orchestrator._dispatch(issue, cfg)

    updated = await board.get_issue(issue.key)
    assert updated is not None
    assert updated.status == IssueStatus.WORKING
    assert updated.attempt_count == 1


async def test_handle_completion_success(orchestrator: Orchestrator, board: Board) -> None:
    issue = await board.create_issue("Success test")
    await board.update_status(issue.key, IssueStatus.WORKING)

    # Simulate a completed task
    async def _return_success() -> RunResult:
        return RunResult(success=True)

    task = asyncio.create_task(_return_success())
    await task  # Let it complete

    ws = MagicMock(spec=Workspace)
    ws.cleanup = AsyncMock()
    run = ActiveRun(issue=issue, workspace=ws, task=task)

    await orchestrator._handle_completion(run)

    updated = await board.get_issue(issue.key)
    assert updated is not None
    assert updated.status == IssueStatus.REVIEW


async def test_handle_completion_failure_retry(orchestrator: Orchestrator, board: Board) -> None:
    issue = await board.create_issue("Failure test")
    await board.update_status(issue.key, IssueStatus.WORKING)
    await board.update_issue(issue.key, attempt_count=1)

    async def _return_failure() -> RunResult:
        return RunResult(success=False, error="Build failed")

    task = asyncio.create_task(_return_failure())
    await task

    ws = MagicMock(spec=Workspace)
    ws.cleanup = AsyncMock()

    run = ActiveRun(issue=issue, workspace=ws, task=task)

    await orchestrator._handle_completion(run)

    updated = await board.get_issue(issue.key)
    assert updated is not None
    # Should go back to TODO for retry (attempt 1 < max_retries 3)
    assert updated.status == IssueStatus.TODO
    assert updated.error_log == "Build failed"


async def test_handle_completion_failure_max_retries(
    orchestrator: Orchestrator, board: Board
) -> None:
    issue = await board.create_issue("Max retry test")
    await board.update_status(issue.key, IssueStatus.WORKING)
    await board.update_issue(issue.key, attempt_count=3)  # Already at max

    async def _return_still_broken() -> RunResult:
        return RunResult(success=False, error="Still broken")

    task = asyncio.create_task(_return_still_broken())
    await task

    ws = MagicMock(spec=Workspace)
    ws.cleanup = AsyncMock()

    run = ActiveRun(issue=issue, workspace=ws, task=task)

    await orchestrator._handle_completion(run)

    updated = await board.get_issue(issue.key)
    assert updated is not None
    assert updated.status == IssueStatus.FAILED


async def test_manual_retry_failed(orchestrator: Orchestrator, board: Board) -> None:
    issue = await board.create_issue("Retry me")
    await board.update_status(issue.key, IssueStatus.WORKING)
    await board.update_status(issue.key, IssueStatus.FAILED)

    await orchestrator.manual_retry(issue.key)

    updated = await board.get_issue(issue.key)
    assert updated is not None
    assert updated.status == IssueStatus.TODO
    assert updated.attempt_count == 0


async def test_manual_retry_review(orchestrator: Orchestrator, board: Board) -> None:
    issue = await board.create_issue("Review retry")
    await board.update_status(issue.key, IssueStatus.WORKING)
    await board.update_status(issue.key, IssueStatus.REVIEW)

    await orchestrator.manual_retry(issue.key)

    updated = await board.get_issue(issue.key)
    assert updated is not None
    assert updated.status == IssueStatus.TODO


async def test_manual_retry_invalid_status(orchestrator: Orchestrator, board: Board) -> None:
    issue = await board.create_issue("Can't retry")
    await board.update_status(issue.key, IssueStatus.WORKING)

    with pytest.raises(ValueError, match="Cannot retry"):
        await orchestrator.manual_retry(issue.key)


async def test_manual_retry_not_found(orchestrator: Orchestrator) -> None:
    with pytest.raises(ValueError, match="not found"):
        await orchestrator.manual_retry("CTX-999")


async def test_handle_completion_calls_on_issue_completed(board: Board, workflow_content: str, tmp_path: Path) -> None:
    """on_issue_completed callback should be called when an issue finishes."""
    wf = tmp_path / "WORKFLOW.md"
    wf.write_text(workflow_content)
    loader = WorkflowLoader(wf)

    on_completed = AsyncMock()
    notify = AsyncMock()
    orch = Orchestrator(board, loader, on_issue_completed=on_completed, notify=notify)

    issue = await board.create_issue("Callback test")
    await board.update_status(issue.key, IssueStatus.WORKING)

    async def _return_success() -> RunResult:
        return RunResult(success=True)

    task = asyncio.create_task(_return_success())
    await task

    ws = MagicMock(spec=Workspace)
    ws.cleanup = AsyncMock()
    run = ActiveRun(issue=issue, workspace=ws, task=task)

    await orch._handle_completion(run)

    on_completed.assert_awaited_once_with(issue.key, IssueStatus.REVIEW)
    notify.assert_awaited_once()
    # Verify the notify was called with issue_updated event
    call_args = notify.call_args
    assert call_args[0][0] == "issue_updated"


async def test_handle_completion_calls_notify_on_failure(board: Board, workflow_content: str, tmp_path: Path) -> None:
    """notify callback should fire on failure too."""
    wf = tmp_path / "WORKFLOW.md"
    wf.write_text(workflow_content)
    loader = WorkflowLoader(wf)

    on_completed = AsyncMock()
    notify = AsyncMock()
    orch = Orchestrator(board, loader, on_issue_completed=on_completed, notify=notify)

    issue = await board.create_issue("Fail notify test")
    await board.update_status(issue.key, IssueStatus.WORKING)
    await board.update_issue(issue.key, attempt_count=1)

    async def _return_failure() -> RunResult:
        return RunResult(success=False, error="Oops")

    task = asyncio.create_task(_return_failure())
    await task

    ws = MagicMock(spec=Workspace)
    ws.cleanup = AsyncMock()
    run = ActiveRun(issue=issue, workspace=ws, task=task)

    await orch._handle_completion(run)

    on_completed.assert_awaited_once_with(issue.key, IssueStatus.TODO)
    notify.assert_awaited_once()
