"""Tests for the FastAPI web endpoints."""

from __future__ import annotations

from pathlib import Path

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from maestro.board import Board
from maestro.models import IssueStatus
from maestro.web import create_app


pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def client(board: Board):
    """Create a test client with a fresh board."""
    app, _notify = create_app(board)
    with TestClient(app) as c:
        yield c, board


async def test_index(client) -> None:
    c, _ = client
    res = c.get("/")
    assert res.status_code == 200


async def test_create_issue(client) -> None:
    c, _ = client
    res = c.post("/api/issues", json={
        "title": "Test issue",
        "description": "A description",
        "priority": "high",
        "labels": ["bug"],
    })
    assert res.status_code == 201
    data = res.json()
    assert data["key"] == "MST-1"
    assert data["title"] == "Test issue"
    assert data["status"] == "todo"


async def test_list_issues(client) -> None:
    c, board = client
    await board.create_issue("Issue A")
    await board.create_issue("Issue B")

    res = c.get("/api/issues")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2


async def test_list_issues_by_status(client) -> None:
    c, board = client
    await board.create_issue("A")
    i2 = await board.create_issue("B")
    await board.update_status(i2.key, IssueStatus.WORKING)

    res = c.get("/api/issues?status=todo")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["status"] == "todo"


async def test_list_issues_invalid_status(client) -> None:
    c, _ = client
    res = c.get("/api/issues?status=invalid")
    assert res.status_code == 400


async def test_get_issue(client) -> None:
    c, board = client
    issue = await board.create_issue("Detail test")

    res = c.get(f"/api/issues/{issue.key}")
    assert res.status_code == 200
    data = res.json()
    assert data["key"] == issue.key
    assert "activity" in data


async def test_get_issue_not_found(client) -> None:
    c, _ = client
    res = c.get("/api/issues/MST-999")
    assert res.status_code == 404


async def test_update_issue(client) -> None:
    c, board = client
    issue = await board.create_issue("Update me")

    res = c.patch(f"/api/issues/{issue.key}", json={"title": "Updated"})
    assert res.status_code == 200
    assert res.json()["title"] == "Updated"


async def test_update_issue_status(client) -> None:
    c, board = client
    issue = await board.create_issue("Status change")

    res = c.patch(f"/api/issues/{issue.key}", json={"status": "working"})
    assert res.status_code == 200
    assert res.json()["status"] == "working"


async def test_update_issue_invalid_transition(client) -> None:
    c, board = client
    issue = await board.create_issue("Bad transition")

    res = c.patch(f"/api/issues/{issue.key}", json={"status": "done"})
    assert res.status_code == 400


async def test_delete_issue(client) -> None:
    c, board = client
    issue = await board.create_issue("Delete me")

    res = c.delete(f"/api/issues/{issue.key}")
    assert res.status_code == 204

    res = c.get(f"/api/issues/{issue.key}")
    assert res.status_code == 404


async def test_delete_issue_not_found(client) -> None:
    c, _ = client
    res = c.delete("/api/issues/MST-999")
    assert res.status_code == 404


async def test_get_activity(client) -> None:
    c, board = client
    issue = await board.create_issue("Activity test")

    res = c.get(f"/api/issues/{issue.key}/activity")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1


async def test_get_stats(client) -> None:
    c, board = client
    await board.create_issue("A")
    await board.create_issue("B")

    res = c.get("/api/stats")
    assert res.status_code == 200
    data = res.json()
    assert data["todo"] == 2
    assert data["total"] == 2
