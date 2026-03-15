"""Tests for the ChatStore CRUD operations."""

from __future__ import annotations

import pytest
import pytest_asyncio

from cortex.board import Board
from cortex.chat import ChatStore
from cortex.models import MessageRole, PipelinePhase


pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def chat_store(board: Board) -> ChatStore:
    """Create a ChatStore sharing the board's DB connection."""
    return ChatStore(board.db)


async def test_create_pipeline(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test Feature", "Build a test feature")
    assert pipeline.id == 1
    assert pipeline.name == "Test Feature"
    assert pipeline.requirement == "Build a test feature"
    assert pipeline.phase == PipelinePhase.REPO_CONTEXT


async def test_get_pipeline(chat_store: ChatStore) -> None:
    created = await chat_store.create_pipeline("Test", "requirement")
    fetched = await chat_store.get_pipeline(created.id)
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.name == "Test"


async def test_get_pipeline_not_found(chat_store: ChatStore) -> None:
    result = await chat_store.get_pipeline(999)
    assert result is None


async def test_get_pipelines(chat_store: ChatStore) -> None:
    await chat_store.create_pipeline("A", "req A")
    await chat_store.create_pipeline("B", "req B")
    pipelines = await chat_store.get_pipelines()
    assert len(pipelines) == 2
    # Should be ordered by id DESC
    assert pipelines[0].name == "B"
    assert pipelines[1].name == "A"


async def test_update_pipeline(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    updated = await chat_store.update_pipeline(
        pipeline.id, phase=PipelinePhase.BA_ANALYSIS.value,
    )
    assert updated.phase == PipelinePhase.BA_ANALYSIS


async def test_update_pipeline_repo_context(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    updated = await chat_store.update_pipeline(
        pipeline.id, repo_context="Python project with Flask",
    )
    assert updated.repo_context == "Python project with Flask"


async def test_update_pipeline_invalid_field(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    with pytest.raises(ValueError, match="Invalid fields"):
        await chat_store.update_pipeline(pipeline.id, nonexistent="value")


async def test_update_pipeline_not_found(chat_store: ChatStore) -> None:
    with pytest.raises(ValueError, match="not found"):
        await chat_store.update_pipeline(999, name="new name")


async def test_add_message(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    msg = await chat_store.add_message(
        pipeline.id, MessageRole.USER, "Hello",
        PipelinePhase.REPO_CONTEXT,
    )
    assert msg.id == 1
    assert msg.pipeline_id == pipeline.id
    assert msg.role == MessageRole.USER
    assert msg.content == "Hello"
    assert msg.phase == PipelinePhase.REPO_CONTEXT


async def test_add_message_with_metadata(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    msg = await chat_store.add_message(
        pipeline.id, MessageRole.ASSISTANT, "Stories",
        PipelinePhase.BA_ANALYSIS,
        metadata='[{"title": "story1"}]',
    )
    assert msg.metadata == '[{"title": "story1"}]'


async def test_get_messages(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    await chat_store.add_message(
        pipeline.id, MessageRole.USER, "First",
        PipelinePhase.REPO_CONTEXT,
    )
    await chat_store.add_message(
        pipeline.id, MessageRole.ASSISTANT, "Second",
        PipelinePhase.REPO_CONTEXT,
    )
    messages = await chat_store.get_messages(pipeline.id)
    assert len(messages) == 2
    assert messages[0].content == "First"
    assert messages[1].content == "Second"


async def test_get_messages_empty(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    messages = await chat_store.get_messages(pipeline.id)
    assert len(messages) == 0


async def test_pipeline_to_dict(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    d = pipeline.to_dict()
    assert d["id"] == pipeline.id
    assert d["name"] == "Test"
    assert d["phase"] == "repo_context"
    assert "created_at" in d


async def test_message_to_dict(chat_store: ChatStore) -> None:
    pipeline = await chat_store.create_pipeline("Test", "requirement")
    msg = await chat_store.add_message(
        pipeline.id, MessageRole.SYSTEM, "System msg",
        PipelinePhase.REPO_CONTEXT,
    )
    d = msg.to_dict()
    assert d["role"] == "system"
    assert d["content"] == "System msg"
    assert d["phase"] == "repo_context"
