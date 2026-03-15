"""Tests for the Kanban board SQLite CRUD operations."""

from __future__ import annotations

import pytest

from cortex.board import Board
from cortex.models import IssueStatus


pytestmark = pytest.mark.asyncio


async def test_create_issue(board: Board) -> None:
    issue = await board.create_issue(
        "Test issue", "A description", "high", ["bug"], story_id="STORY-1", depends_on=["CTX-9"]
    )
    assert issue.key == "CTX-1"
    assert issue.title == "Test issue"
    assert issue.description == "A description"
    assert issue.priority == "high"
    assert issue.labels == ["bug"]
    assert issue.status == IssueStatus.TODO
    assert issue.attempt_count == 0
    assert issue.story_id == "STORY-1"
    assert issue.depends_on == ["CTX-9"]


async def test_auto_increment_keys(board: Board) -> None:
    i1 = await board.create_issue("First")
    i2 = await board.create_issue("Second")
    i3 = await board.create_issue("Third")
    assert i1.key == "CTX-1"
    assert i2.key == "CTX-2"
    assert i3.key == "CTX-3"


async def test_get_issues_all(board: Board) -> None:
    await board.create_issue("A")
    await board.create_issue("B")
    issues = await board.get_issues()
    assert len(issues) == 2


async def test_get_issues_by_status(board: Board) -> None:
    await board.create_issue("A")
    await board.create_issue("B")
    todo = await board.get_issues(status=IssueStatus.TODO)
    assert len(todo) == 2
    working = await board.get_issues(status=IssueStatus.WORKING)
    assert len(working) == 0


async def test_get_issue(board: Board) -> None:
    created = await board.create_issue("Test")
    fetched = await board.get_issue(created.key)
    assert fetched is not None
    assert fetched.key == created.key
    assert fetched.title == "Test"


async def test_get_issue_not_found(board: Board) -> None:
    result = await board.get_issue("CTX-999")
    assert result is None


async def test_update_status_valid(board: Board) -> None:
    issue = await board.create_issue("Test")
    updated = await board.update_status(issue.key, IssueStatus.WORKING)
    assert updated.status == IssueStatus.WORKING


async def test_update_status_invalid_transition(board: Board) -> None:
    issue = await board.create_issue("Test")
    with pytest.raises(ValueError, match="Invalid transition"):
        await board.update_status(issue.key, IssueStatus.DONE)


async def test_update_status_not_found(board: Board) -> None:
    with pytest.raises(ValueError, match="not found"):
        await board.update_status("CTX-999", IssueStatus.WORKING)


async def test_full_lifecycle(board: Board) -> None:
    issue = await board.create_issue("Lifecycle test")
    assert issue.status == IssueStatus.TODO

    issue = await board.update_status(issue.key, IssueStatus.WORKING)
    assert issue.status == IssueStatus.WORKING

    issue = await board.update_status(issue.key, IssueStatus.REVIEW)
    assert issue.status == IssueStatus.REVIEW

    issue = await board.update_status(issue.key, IssueStatus.DONE)
    assert issue.status == IssueStatus.DONE


async def test_retry_lifecycle(board: Board) -> None:
    issue = await board.create_issue("Retry test")
    await board.update_status(issue.key, IssueStatus.WORKING)
    await board.update_status(issue.key, IssueStatus.FAILED)
    # Failed -> TODO for retry
    await board.update_status(issue.key, IssueStatus.TODO)
    issue = await board.get_issue(issue.key)
    assert issue is not None
    assert issue.status == IssueStatus.TODO


async def test_update_issue_fields(board: Board) -> None:
    issue = await board.create_issue("Original")
    updated = await board.update_issue(
        issue.key, title="Updated", priority="low", blocked_reason="Waiting for MST-1"
    )
    assert updated.title == "Updated"
    assert updated.priority == "low"
    assert updated.blocked_reason == "Waiting for MST-1"


async def test_update_issue_invalid_field(board: Board) -> None:
    issue = await board.create_issue("Test")
    with pytest.raises(ValueError, match="Invalid fields"):
        await board.update_issue(issue.key, nonexistent="value")


async def test_delete_issue(board: Board) -> None:
    issue = await board.create_issue("Delete me")
    await board.delete_issue(issue.key)
    result = await board.get_issue(issue.key)
    assert result is None


async def test_activity_log(board: Board) -> None:
    issue = await board.create_issue("Activity test")
    # Creating an issue already logs "created"
    activity = await board.get_activity(issue.key)
    assert len(activity) >= 1
    assert activity[0].event == "created"


async def test_activity_log_on_status_change(board: Board) -> None:
    issue = await board.create_issue("Status log test")
    await board.update_status(issue.key, IssueStatus.WORKING)
    activity = await board.get_activity(issue.key)
    events = [a.event for a in activity]
    assert "status_changed" in events


async def test_get_stats(board: Board) -> None:
    await board.create_issue("A")
    await board.create_issue("B")
    i3 = await board.create_issue("C")
    await board.update_status(i3.key, IssueStatus.WORKING)

    stats = await board.get_stats()
    assert stats["todo"] == 2
    assert stats["working"] == 1
    assert stats["total"] == 3


async def test_delete_cascades_activity(board: Board) -> None:
    issue = await board.create_issue("Cascade test")
    await board.log_activity(issue.key, "test_event", "details")
    await board.delete_issue(issue.key)
    activity = await board.get_activity(issue.key)
    assert len(activity) == 0
