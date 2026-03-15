"""Tests for the markdown file watcher."""

from __future__ import annotations

from pathlib import Path

import pytest
import pytest_asyncio

from cortex.board import Board
from cortex.watcher import parse_issue_markdown, IssueFileHandler


def test_parse_issue_markdown(sample_issue_md: str) -> None:
    result = parse_issue_markdown(sample_issue_md)
    assert result["title"] == "Fix login timeout bug"
    assert result["priority"] == "high"
    assert result["labels"] == ["bug", "auth"]
    assert "Login page" in result["description"]


def test_parse_issue_markdown_defaults() -> None:
    content = """---
title: Simple task
---

Do the thing.
"""
    result = parse_issue_markdown(content)
    assert result["title"] == "Simple task"
    assert result["priority"] == "medium"
    assert result["labels"] == []
    assert "Do the thing" in result["description"]


def test_parse_issue_markdown_no_frontmatter() -> None:
    with pytest.raises(ValueError, match="YAML frontmatter"):
        parse_issue_markdown("Just plain text")


def test_parse_issue_markdown_empty_frontmatter() -> None:
    content = """---
---

Body only.
"""
    result = parse_issue_markdown(content)
    assert result["title"] == "Untitled"
    assert result["description"] == "Body only."


@pytest.mark.asyncio
async def test_process_file(board: Board, tmp_path: Path, sample_issue_md: str) -> None:
    """Test that processing a markdown file creates an issue and archives it."""
    import asyncio

    issues_dir = tmp_path / "issues"
    issues_dir.mkdir()
    archived_dir = issues_dir / "archived"

    # Write a sample issue file
    issue_file = issues_dir / "fix-login.md"
    issue_file.write_text(sample_issue_md)

    loop = asyncio.get_running_loop()
    handler = IssueFileHandler(board, issues_dir, loop)

    await handler._process_file(issue_file)

    # Check issue was created
    issues = await board.get_issues()
    assert len(issues) == 1
    assert issues[0].title == "Fix login timeout bug"
    assert issues[0].priority == "high"
    assert issues[0].labels == ["bug", "auth"]

    # Check file was archived
    assert not issue_file.exists()
    assert (archived_dir / "fix-login.md").exists()
