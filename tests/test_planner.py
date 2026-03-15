"""Tests for the Planner agent: story parsing and prompt construction."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio

from cortex.board import Board
from cortex.chat import ChatStore
from cortex.models import MessageRole, PipelinePhase
from cortex.planner import (
    PlannerAgent,
    extract_json_object,
    extract_json_from_output,
    extract_result_content,
    extract_verdict,
)
from cortex.runner import CopilotRunner, RunResult


pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def chat_store(board: Board) -> ChatStore:
    return ChatStore(board.db)


@pytest.fixture
def mock_runner() -> MagicMock:
    return MagicMock(spec=CopilotRunner)


@pytest.fixture
def planner(mock_runner, board, chat_store) -> PlannerAgent:
    return PlannerAgent(mock_runner, board, chat_store)


# --- JSON extraction tests ---

def test_extract_json_from_code_fence() -> None:
    text = 'Here are the stories:\n```json\n[{"title": "A"}, {"title": "B"}]\n```\nDone.'
    result = extract_json_from_output(text)
    assert result is not None
    assert len(result) == 2
    assert result[0]["title"] == "A"


def test_extract_json_from_raw_array() -> None:
    text = 'Here are the stories: [{"title": "X"}] and that is all.'
    result = extract_json_from_output(text)
    assert result is not None
    assert len(result) == 1
    assert result[0]["title"] == "X"


def test_extract_json_invalid() -> None:
    text = "No JSON here, just plain text."
    result = extract_json_from_output(text)
    assert result is None


def test_extract_json_malformed_fence() -> None:
    text = '```json\n{invalid json}\n```'
    result = extract_json_from_output(text)
    assert result is None


def test_extract_json_multiline_fence() -> None:
    text = '''Here you go:
```json
[
  {
    "title": "Story 1",
    "description": "Do something",
    "priority": "high",
    "labels": ["backend"],
    "acceptance_criteria": ["It works"]
  }
]
```
'''
    result = extract_json_from_output(text)
    assert result is not None
    assert len(result) == 1
    assert result[0]["priority"] == "high"


def test_extract_json_object_from_code_fence() -> None:
    text = '```json\n{"status": "ready", "questions": []}\n```'
    result = extract_json_object(text)
    assert result is not None
    assert result["status"] == "ready"


# --- Result content extraction tests ---

def test_extract_result_content_from_result_type() -> None:
    lines = [
        {"type": "system", "data": {"session_id": "abc"}},
        {"type": "assistant", "message": {"content": "working..."}},
        {"type": "result", "result": "Final answer here"},
    ]
    content = extract_result_content(lines)
    assert content == "Final answer here"


def test_extract_result_content_from_assistant() -> None:
    lines = [
        {"type": "assistant", "message": {"content": "My response"}},
    ]
    content = extract_result_content(lines)
    assert content == "My response"


def test_extract_result_content_fallback_raw() -> None:
    lines = [
        {"type": "raw", "content": "line 1"},
        {"type": "raw", "content": "line 2"},
    ]
    content = extract_result_content(lines)
    assert "line 1" in content
    assert "line 2" in content


# --- Planner agent tests ---

async def test_analyze_repo(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    mock_runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": "Python Flask project"}],
        raw_output="Python Flask project",
    ))

    result = await planner.analyze_repo(pipeline.id)
    assert "Python Flask project" in result

    updated = await chat_store.get_pipeline(pipeline.id)
    assert updated is not None
    assert updated.repo_context == "Python Flask project"


async def test_analyze_repo_failure(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    mock_runner.run = AsyncMock(return_value=RunResult(
        success=False,
        error="Binary not found",
    ))

    with pytest.raises(RuntimeError, match="Binary not found"):
        await planner.analyze_repo(pipeline.id)


async def test_generate_stories(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "Build a login page")
    await chat_store.update_pipeline(
        pipeline.id, repo_context="Flask project", analysis_doc="# Analysis"
    )

    stories_json = json.dumps([
        {"title": "Login Form", "description": "Create login form", "priority": "high",
         "labels": ["frontend"], "acceptance_criteria": ["Form renders"]},
    ])
    mock_runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": f"```json\n{stories_json}\n```"}],
        raw_output=f"```json\n{stories_json}\n```",
    ))

    stories = await planner.generate_stories(pipeline.id)
    assert len(stories) == 1
    assert stories[0]["title"] == "Login Form"

    updated = await chat_store.get_pipeline(pipeline.id)
    assert updated is not None
    assert updated.stories_json is not None


async def test_generate_stories_parse_failure(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    await chat_store.update_pipeline(
        pipeline.id, repo_context="context", analysis_doc="# Analysis"
    )

    mock_runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": "Not valid JSON at all"}],
        raw_output="Not valid JSON at all",
    ))

    with pytest.raises(RuntimeError, match="Failed to parse stories JSON"):
        await planner.generate_stories(pipeline.id)


async def test_create_issues_from_stories(planner, board, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    stories = [
        {
            "story_id": "STORY-1",
            "title": "Story A",
            "description": "Do A",
            "priority": "high",
            "labels": ["backend"],
            "acceptance_criteria": ["A works"],
            "depends_on": [],
        },
        {
            "story_id": "STORY-2",
            "title": "Story B",
            "description": "Do B",
            "priority": "medium",
            "labels": [],
            "acceptance_criteria": ["B works"],
            "depends_on": ["STORY-1"],
        },
    ]

    issues = await planner.create_issues_from_stories(pipeline.id, stories)
    assert len(issues) == 2
    assert issues[0].title == "Story A"
    assert issues[0].pipeline_id == pipeline.id
    assert issues[0].story_id == "STORY-1"
    assert issues[1].title == "Story B"

    # Verify issues are on the board
    board_issues = await board.get_issues_by_pipeline(pipeline.id)
    assert len(board_issues) == 2
    assert board_issues[1].depends_on == [board_issues[0].key]
    assert "Acceptance Criteria" in board_issues[0].description


async def test_generate_clarifications(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "Build dashboard")
    await chat_store.update_pipeline(pipeline.id, repo_context="FastAPI repo")

    payload = {
        "status": "needs_clarification",
        "summary": "Missing actor and success metric",
        "questions": [
            {"id": "Q1", "question": "Who is the actor?", "rationale": "Needed for scope"}
        ],
    }
    mock_runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": f"```json\n{json.dumps(payload)}\n```"}],
        raw_output=f"```json\n{json.dumps(payload)}\n```",
    ))

    result = await planner.generate_clarifications(pipeline.id)
    assert result["status"] == "needs_clarification"
    updated = await chat_store.get_pipeline(pipeline.id)
    assert updated is not None
    assert updated.clarification_questions_json is not None


async def test_generate_analysis_doc(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "Build dashboard")
    await chat_store.update_pipeline(
        pipeline.id,
        repo_context="FastAPI repo",
        clarification_answers_json='[{"answer":"Actor is analyst"}]',
    )

    mock_runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": "# Objective\nBuild dashboard"}],
        raw_output="# Objective\nBuild dashboard",
    ))

    result = await planner.generate_analysis_doc(pipeline.id)
    assert "# Objective" in result
    updated = await chat_store.get_pipeline(pipeline.id)
    assert updated is not None
    assert updated.analysis_doc is not None


async def test_run_code_review(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(pipeline.id, stories_json='[{"title":"A"}]')

    verdict_json = '```json\n{"verdict": "PASS", "score": 90, "issues": [], "summary": "LGTM"}\n```'
    mock_runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": verdict_json}],
        raw_output=verdict_json,
    ))

    content, verdict = await planner.run_code_review(pipeline.id)
    assert verdict["verdict"] == "PASS"
    assert verdict["score"] == 90

    updated = await chat_store.get_pipeline(pipeline.id)
    assert updated is not None
    assert updated.review_report is not None


async def test_run_code_review_no_verdict(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(pipeline.id, stories_json='[{"title":"A"}]')

    mock_runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": "LGTM - no issues found"}],
        raw_output="LGTM - no issues found",
    ))

    content, verdict = await planner.run_code_review(pipeline.id)
    # Should default to PASS when verdict can't be parsed
    assert verdict["verdict"] == "PASS"


async def test_run_test_validation(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "req")
    await chat_store.update_pipeline(pipeline.id, stories_json='[{"title":"A"}]')

    verdict_json = '```json\n{"verdict": "PASS", "score": 85, "issues": [], "summary": "All tests pass"}\n```'
    mock_runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": verdict_json}],
        raw_output=verdict_json,
    ))

    content, verdict = await planner.run_test_validation(pipeline.id)
    assert verdict["verdict"] == "PASS"

    updated = await chat_store.get_pipeline(pipeline.id)
    assert updated is not None
    assert updated.test_report is not None


# --- Verdict extraction tests ---

def test_extract_verdict_from_code_fence() -> None:
    text = '```json\n{"verdict": "PASS", "score": 90, "issues": [], "summary": "LGTM"}\n```'
    result = extract_verdict(text)
    assert result is not None
    assert result["verdict"] == "PASS"
    assert result["score"] == 90


def test_extract_verdict_from_raw_json() -> None:
    text = 'Here is my verdict: {"verdict": "FAIL", "score": 30, "issues": ["Missing tests"], "summary": "Bad"}'
    result = extract_verdict(text)
    assert result is not None
    assert result["verdict"] == "FAIL"


def test_extract_verdict_no_verdict_key() -> None:
    text = '{"score": 90, "summary": "good"}'
    result = extract_verdict(text)
    assert result is None


def test_extract_verdict_invalid_json() -> None:
    text = "No JSON here at all"
    result = extract_verdict(text)
    assert result is None


# --- Story quality evaluation ---

async def test_evaluate_stories(planner, mock_runner, chat_store) -> None:
    pipeline = await chat_store.create_pipeline("Test", "Build login")
    await chat_store.update_pipeline(
        pipeline.id,
        stories_json='[{"title": "Login form", "description": "Create login"}]',
    )

    verdict_json = '```json\n{"verdict": "PASS", "score": 85, "issues": [], "summary": "Good stories"}\n```'
    mock_runner.run = AsyncMock(return_value=RunResult(
        success=True,
        output_lines=[{"type": "result", "result": verdict_json}],
        raw_output=verdict_json,
    ))

    verdict = await planner.evaluate_stories(pipeline.id)
    assert verdict["verdict"] == "PASS"
    assert verdict["score"] == 85
