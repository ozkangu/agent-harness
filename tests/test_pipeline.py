"""Tests for the Pipeline state machine."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from maestro.board import Board
from maestro.chat import ChatStore
from maestro.models import (
    IssueStatus,
    MessageRole,
    PHASE_TRANSITIONS,
    PipelinePhase,
)
from maestro.pipeline import PipelineManager
from maestro.planner import PlannerAgent
from maestro.runner import CopilotRunner, RunResult


pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def chat_store(board: Board) -> ChatStore:
    return ChatStore(board.db)


@pytest.fixture
def mock_runner() -> CopilotRunner:
    runner = MagicMock(spec=CopilotRunner)
    runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": "mock output"}],
        raw_output="mock output",
    ))
    return runner


@pytest.fixture
def planner(mock_runner, board, chat_store) -> PlannerAgent:
    return PlannerAgent(mock_runner, board, chat_store)


@pytest.fixture
def notify() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def pipeline_mgr(chat_store, board, planner, notify) -> PipelineManager:
    """Pipeline manager in manual mode (auto_approve=False) for backward compat tests."""
    return PipelineManager(chat_store, board, planner, notify=notify, auto_approve=False)


@pytest.fixture
def auto_pipeline_mgr(chat_store, board, planner, notify) -> PipelineManager:
    """Pipeline manager in auto-approve mode."""
    return PipelineManager(chat_store, board, planner, notify=notify, auto_approve=True)


# --- Phase transition tests ---

def test_phase_transitions_all_phases_covered() -> None:
    """Every PipelinePhase must have a transition entry."""
    for phase in PipelinePhase:
        assert phase in PHASE_TRANSITIONS


def test_phase_transitions_done_is_terminal() -> None:
    assert PHASE_TRANSITIONS[PipelinePhase.DONE] == set()


def test_phase_transitions_failed_can_restart() -> None:
    assert PipelinePhase.REPO_CONTEXT in PHASE_TRANSITIONS[PipelinePhase.FAILED]


# --- Pipeline creation ---

async def test_start_pipeline(pipeline_mgr, chat_store) -> None:
    # Mock the planner to not actually run
    pipeline_mgr.planner.analyze_repo = AsyncMock(return_value="repo context")
    pipeline_mgr.planner.generate_clarifications = AsyncMock(
        return_value={"status": "ready", "summary": "Clear enough", "questions": []}
    )
    pipeline_mgr.planner.generate_analysis_doc = AsyncMock(return_value="# Analysis")
    pipeline_mgr.planner.generate_stories = AsyncMock(return_value=[])

    result = await pipeline_mgr.start_pipeline("Build a login page")
    assert result["name"] == "Build a login page"
    assert result["phase"] == "repo_context"

    pipeline = await chat_store.get_pipeline(result["id"])
    assert pipeline is not None


async def test_start_pipeline_auto_mode(auto_pipeline_mgr, chat_store) -> None:
    auto_pipeline_mgr.planner.analyze_repo = AsyncMock(return_value="repo context")
    auto_pipeline_mgr.planner.generate_clarifications = AsyncMock(
        return_value={"status": "ready", "summary": "Clear enough", "questions": []}
    )
    auto_pipeline_mgr.planner.generate_analysis_doc = AsyncMock(return_value="# Analysis")
    auto_pipeline_mgr.planner.generate_stories = AsyncMock(return_value=[])

    result = await auto_pipeline_mgr.start_pipeline("Build a dashboard")
    assert result["name"] == "Build a dashboard"

    # Give async task time to run
    await asyncio.sleep(0.2)

    pipeline = await chat_store.get_pipeline(result["id"])
    assert pipeline is not None
    # Story approval is always manual, so it should stop at AWAITING_APPROVAL_1
    assert pipeline.phase == PipelinePhase.AWAITING_APPROVAL_1


# --- Approval gates (manual mode) ---

async def test_approve_awaiting_phase(pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    # Set to awaiting_approval_1
    await chat_store.update_pipeline(
        pipeline.id, phase=PipelinePhase.AWAITING_APPROVAL_1.value,
        stories_json='[{"title": "Story 1"}]',
    )

    # Mock issue creation
    pipeline_mgr.planner.create_issues_from_stories = AsyncMock(return_value=[])

    result = await pipeline_mgr.approve(pipeline.id)
    # Give async task a moment
    await asyncio.sleep(0.1)

    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    assert pipeline.phase in (
        PipelinePhase.CODING,
        PipelinePhase.AWAITING_APPROVAL_1,
    )


async def test_approve_non_awaiting_phase_raises(pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    # phase is repo_context by default

    with pytest.raises(ValueError, match="not in an approval phase"):
        await pipeline_mgr.approve(pipeline.id)


async def test_reject_awaiting_phase(pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(
        pipeline.id, phase=PipelinePhase.AWAITING_APPROVAL_1.value,
    )

    result = await pipeline_mgr.reject(pipeline.id)
    assert result["phase"] == "ba_analysis"


async def test_reject_non_awaiting_phase_raises(pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    with pytest.raises(ValueError, match="not in an approval phase"):
        await pipeline_mgr.reject(pipeline.id)


# --- User messages ---

async def test_handle_user_message_records(pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(pipeline.id, phase=PipelinePhase.DONE.value)
    result = await pipeline_mgr.handle_user_message(pipeline.id, "hello world")

    assert result["content"] == "hello world"
    assert result["role"] == "user"

    messages = await chat_store.get_messages(pipeline.id)
    user_msgs = [m for m in messages if m.role == MessageRole.USER]
    assert len(user_msgs) == 1


async def test_handle_user_message_awaiting_clarification_restarts_phase(
    pipeline_mgr, chat_store
) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(
        pipeline.id,
        phase=PipelinePhase.AWAITING_CLARIFICATION.value,
        clarification_questions_json='[{"id":"Q1","question":"Need actor?"}]',
    )

    pipeline_mgr.planner.append_clarification_answer = AsyncMock()
    pipeline_mgr.planner.generate_clarifications = AsyncMock(
        return_value={"status": "ready", "summary": "Enough detail", "questions": []}
    )
    pipeline_mgr.planner.generate_analysis_doc = AsyncMock(return_value="# Analysis")
    pipeline_mgr.planner.generate_stories = AsyncMock(return_value=[])

    await pipeline_mgr.handle_user_message(pipeline.id, "Actor is analyst.")
    await asyncio.sleep(0.2)

    pipeline_mgr.planner.append_clarification_answer.assert_awaited_once()
    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    assert pipeline.phase == PipelinePhase.AWAITING_APPROVAL_1


async def test_handle_user_message_resumes_idle_pipeline(
    pipeline_mgr, chat_store
) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(
        pipeline.id,
        phase=PipelinePhase.REPO_CONTEXT.value,
    )

    pipeline_mgr.planner.analyze_repo = AsyncMock(return_value="repo context")
    pipeline_mgr.planner.generate_clarifications = AsyncMock(
        return_value={"status": "ready", "summary": "Clear enough", "questions": []}
    )
    pipeline_mgr.planner.generate_analysis_doc = AsyncMock(return_value="# Analysis")
    pipeline_mgr.planner.generate_stories = AsyncMock(return_value=[])

    result = await pipeline_mgr.handle_user_message(pipeline.id, "selam")
    assert "Resuming now" in result["content"]

    await asyncio.sleep(0.2)
    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    assert pipeline.phase == PipelinePhase.AWAITING_APPROVAL_1


async def test_resume_incomplete_pipelines_restarts_active_phase(
    pipeline_mgr, chat_store
) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(pipeline.id, phase=PipelinePhase.REPO_CONTEXT.value)

    pipeline_mgr.planner.analyze_repo = AsyncMock(return_value="repo context")
    pipeline_mgr.planner.generate_clarifications = AsyncMock(
        return_value={"status": "ready", "summary": "Clear enough", "questions": []}
    )
    pipeline_mgr.planner.generate_analysis_doc = AsyncMock(return_value="# Analysis")
    pipeline_mgr.planner.generate_stories = AsyncMock(return_value=[])

    await pipeline_mgr.resume_incomplete_pipelines()
    await asyncio.sleep(0.2)

    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    assert pipeline.phase == PipelinePhase.AWAITING_APPROVAL_1


async def test_handle_user_message_restarts_failed_pipeline(
    pipeline_mgr, chat_store
) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(
        pipeline.id,
        phase=PipelinePhase.FAILED.value,
        error="Previous failure",
    )

    pipeline_mgr.planner.analyze_repo = AsyncMock(return_value="repo context")
    pipeline_mgr.planner.generate_clarifications = AsyncMock(
        return_value={"status": "ready", "summary": "Clear enough", "questions": []}
    )
    pipeline_mgr.planner.generate_analysis_doc = AsyncMock(return_value="# Analysis")
    pipeline_mgr.planner.generate_stories = AsyncMock(return_value=[])

    result = await pipeline_mgr.handle_user_message(pipeline.id, "selam")
    assert "Restarting the pipeline" in result["content"]

    await asyncio.sleep(0.2)
    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    assert pipeline.phase == PipelinePhase.AWAITING_APPROVAL_1


async def test_handle_user_approve_keyword(pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(
        pipeline.id, phase=PipelinePhase.AWAITING_APPROVAL_1.value,
        stories_json='[]',
    )

    pipeline_mgr.planner.create_issues_from_stories = AsyncMock(return_value=[])

    result = await pipeline_mgr.handle_user_message(pipeline.id, "approve")
    # Should trigger approval
    await asyncio.sleep(0.1)

    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None


async def test_handle_user_reject_keyword(pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(
        pipeline.id, phase=PipelinePhase.AWAITING_APPROVAL_1.value,
    )

    result = await pipeline_mgr.handle_user_message(pipeline.id, "reject")
    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    assert pipeline.phase == PipelinePhase.BA_ANALYSIS


# --- Coding completion check ---

async def test_check_coding_completion_all_done(pipeline_mgr, board, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    issue = await board.create_issue("Story 1", pipeline_id=pipeline.id)
    await board.update_status(issue.key, IssueStatus.WORKING)
    await board.update_status(issue.key, IssueStatus.REVIEW)
    await board.update_status(issue.key, IssueStatus.DONE)

    result = await pipeline_mgr.check_coding_completion(pipeline.id)
    assert result is True


async def test_check_coding_completion_not_done(pipeline_mgr, board, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await board.create_issue("Story 1", pipeline_id=pipeline.id)

    result = await pipeline_mgr.check_coding_completion(pipeline.id)
    assert result is False


async def test_check_coding_completion_no_issues(pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    result = await pipeline_mgr.check_coding_completion(pipeline.id)
    assert result is False


# --- Phase transition validation ---

async def test_invalid_transition_raises(pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    # repo_context -> done is invalid
    with pytest.raises(ValueError, match="Invalid phase transition"):
        await pipeline_mgr._transition(pipeline.id, PipelinePhase.DONE)


# --- Auto-approve mode tests ---

async def test_auto_approve_attribute(auto_pipeline_mgr) -> None:
    assert auto_pipeline_mgr.auto_approve is True


async def test_manual_mode_attribute(pipeline_mgr) -> None:
    assert pipeline_mgr.auto_approve is False


async def test_auto_ba_analysis_always_awaits(auto_pipeline_mgr, chat_store) -> None:
    """Story approval is always manual, even in auto_approve mode."""
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(pipeline.id, phase=PipelinePhase.BA_ANALYSIS.value)

    auto_pipeline_mgr.planner.generate_stories = AsyncMock(return_value=[{"title": "S1"}])

    # Run the BA analysis phase
    await auto_pipeline_mgr._phase_ba_analysis(pipeline.id)

    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    # Should stop at AWAITING_APPROVAL_1 for user review
    assert pipeline.phase == PipelinePhase.AWAITING_APPROVAL_1


async def test_ba_analysis_generates_once_and_awaits(auto_pipeline_mgr, chat_store) -> None:
    """BA analysis generates stories once and always waits for user approval."""
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(pipeline.id, phase=PipelinePhase.BA_ANALYSIS.value)

    call_count = 0

    async def mock_generate(pid):
        nonlocal call_count
        call_count += 1
        return [{"title": f"Story {call_count}"}]

    auto_pipeline_mgr.planner.generate_stories = mock_generate

    await auto_pipeline_mgr._phase_ba_analysis(pipeline.id)

    # Should have called generate_stories exactly once (no quality gate retry)
    assert call_count == 1

    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    # Always waits for user approval
    assert pipeline.phase == PipelinePhase.AWAITING_APPROVAL_1


async def test_auto_code_review_pass(auto_pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(
        pipeline.id, phase=PipelinePhase.CODE_REVIEW.value,
        stories_json='[{"title":"A"}]',
    )

    auto_pipeline_mgr.planner.run_code_review = AsyncMock(
        return_value=("review content", {"verdict": "PASS", "score": 90, "issues": [], "summary": "Good"})
    )
    auto_pipeline_mgr.planner.run_test_validation = AsyncMock(
        return_value=("test content", {"verdict": "PASS", "score": 85, "issues": [], "summary": "Tests pass"})
    )

    await auto_pipeline_mgr._phase_code_review(pipeline.id)

    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    # Should have advanced through to DONE
    assert pipeline.phase == PipelinePhase.DONE


async def test_auto_test_validation_fail_still_completes(auto_pipeline_mgr, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(
        pipeline.id, phase=PipelinePhase.TEST_VALIDATION.value,
        stories_json='[{"title":"A"}]',
    )

    auto_pipeline_mgr.planner.run_test_validation = AsyncMock(
        return_value=("test content", {"verdict": "FAIL", "score": 40, "issues": ["No tests"], "summary": "Bad"})
    )

    await auto_pipeline_mgr._phase_test_validation(pipeline.id)

    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    # Should still complete (with warnings)
    assert pipeline.phase == PipelinePhase.DONE


# --- notify_issue_completed tests ---

async def test_notify_issue_completed_triggers_advance(auto_pipeline_mgr, board, chat_store) -> None:
    """When all issues are done, notify_issue_completed should advance the pipeline."""
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(pipeline.id, phase=PipelinePhase.CODING.value)

    issue = await board.create_issue("Story 1", pipeline_id=pipeline.id)
    await board.update_status(issue.key, IssueStatus.WORKING)
    await board.update_status(issue.key, IssueStatus.REVIEW)

    # Mock the code review and test validation phases
    auto_pipeline_mgr.planner.run_code_review = AsyncMock(
        return_value=("review", {"verdict": "PASS", "score": 90, "issues": [], "summary": "Good"})
    )
    auto_pipeline_mgr.planner.run_test_validation = AsyncMock(
        return_value=("tests", {"verdict": "PASS", "score": 85, "issues": [], "summary": "Pass"})
    )

    await auto_pipeline_mgr.notify_issue_completed(issue.key, IssueStatus.REVIEW)

    # Give the async task time to run
    await asyncio.sleep(0.3)

    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    # Should have advanced past coding
    assert pipeline.phase in (
        PipelinePhase.AWAITING_APPROVAL_2,
        PipelinePhase.CODE_REVIEW,
        PipelinePhase.DONE,
    )


async def test_notify_issue_completed_no_pipeline_is_noop(auto_pipeline_mgr, board) -> None:
    """Issues without a pipeline_id should be ignored."""
    issue = await board.create_issue("No pipeline")
    await board.update_status(issue.key, IssueStatus.WORKING)
    await board.update_status(issue.key, IssueStatus.REVIEW)

    # Should not raise
    await auto_pipeline_mgr.notify_issue_completed(issue.key, IssueStatus.REVIEW)


async def test_notify_issue_completed_not_coding_phase_is_noop(
    auto_pipeline_mgr, board, chat_store
) -> None:
    """If pipeline is not in CODING phase, notification should be ignored."""
    pipeline = await chat_store.create_pipeline("Test", "req")
    # Pipeline is in REPO_CONTEXT, not CODING
    issue = await board.create_issue("Story 1", pipeline_id=pipeline.id)

    await auto_pipeline_mgr.notify_issue_completed(issue.key, IssueStatus.REVIEW)

    pipeline = await chat_store.get_pipeline(pipeline.id)
    assert pipeline is not None
    assert pipeline.phase == PipelinePhase.REPO_CONTEXT  # unchanged
