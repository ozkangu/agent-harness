"""Shared test fixtures for Maestro tests."""

from __future__ import annotations

import tempfile
from pathlib import Path

import aiosqlite
import pytest
import pytest_asyncio

from maestro.board import Board
from maestro.models import SCHEMA


@pytest_asyncio.fixture
async def board(tmp_path: Path) -> Board:
    """Create a fresh in-memory board for each test."""
    db_path = tmp_path / "test.db"
    b = Board(str(db_path))
    await b.connect()
    yield b
    await b.close()


@pytest_asyncio.fixture
async def db(tmp_path: Path) -> aiosqlite.Connection:
    """Provide a raw aiosqlite connection with the full schema applied."""
    conn = await aiosqlite.connect(str(tmp_path / "test.db"))
    conn.row_factory = aiosqlite.Row
    await conn.executescript(SCHEMA)
    await conn.commit()
    yield conn
    await conn.close()


@pytest.fixture
def workflow_content() -> str:
    """Sample WORKFLOW.md content for testing."""
    return """---
copilot:
  binary: "claude"
  model: "sonnet"
  agent: "maestro-worker"
  max_autopilot_continues: 50
  deny_tools:
    - "shell(rm -rf *)"

orchestrator:
  repo_url: "https://github.com/test/repo.git"
  default_branch: "main"
  max_concurrent_agents: 2
  max_retries: 3
  stall_timeout_seconds: 120
  turn_timeout_seconds: 1800
  backoff_base_seconds: 30
  backoff_max_seconds: 600
  web_port: 8421
  db_path: "test.db"
  issues_dir: "test-issues"
  auto_approve: true
  max_inner_iterations: 3
---

You are a test agent.

## Task
Issue: {{ issue.key }} - {{ issue.title }}
{{ issue.description }}

{% if issue.attempt_count > 0 %}
## Retry
Attempt {{ issue.attempt_count + 1 }}.
Error: {{ issue.error_log }}
{% endif %}
"""


@pytest.fixture
def sample_issue_md() -> str:
    """Sample issue markdown file content."""
    return """---
title: Fix login timeout bug
priority: high
labels: [bug, auth]
---

Login page times out after 30 seconds.
Expected: Session should stay active for 24 hours.
"""
