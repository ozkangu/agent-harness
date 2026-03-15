"""Tests for cortex.middleware."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from cortex.auth import Role, User
from cortex.middleware import AuthMiddleware, RateLimitMiddleware

pytestmark = pytest.mark.asyncio


def _make_app(auth_manager=None, rate_limit=None):
    """Build a minimal Starlette app with middleware for testing."""

    async def homepage(request: Request) -> JSONResponse:
        user = getattr(request.state, "user", None)
        username = user.username if user else "none"
        return JSONResponse({"user": username})

    async def health(request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok"})

    async def login(request: Request) -> JSONResponse:
        return JSONResponse({"token": "fake"})

    app = Starlette(
        routes=[
            Route("/api/test", homepage),
            Route("/api/health", health),
            Route("/api/auth/login", login),
        ],
    )

    if rate_limit is not None:
        app.add_middleware(RateLimitMiddleware, requests_per_minute=rate_limit)

    app.add_middleware(AuthMiddleware, auth_manager=auth_manager)

    return app


class TestAuthMiddleware:
    def test_disabled_auth_returns_anonymous(self):
        app = _make_app(auth_manager=None)
        client = TestClient(app)
        resp = client.get("/api/test")
        assert resp.status_code == 200
        assert resp.json()["user"] == "anonymous"

    def test_enabled_auth_no_token_returns_401(self):
        mgr = MagicMock()
        mgr.enabled = True
        mgr.verify_token = AsyncMock(return_value=None)
        mgr.verify_api_key = AsyncMock(return_value=None)
        app = _make_app(auth_manager=mgr)
        client = TestClient(app)
        resp = client.get("/api/test")
        assert resp.status_code == 401

    def test_public_paths_bypass_auth(self):
        mgr = MagicMock()
        mgr.enabled = True
        app = _make_app(auth_manager=mgr)
        client = TestClient(app)

        resp = client.get("/api/health")
        assert resp.status_code == 200

        resp = client.get("/api/auth/login")
        assert resp.status_code == 200

    def test_bearer_token_auth(self):
        user = User(
            id=1, username="testuser", email="t@t.com",
            role=Role.ADMIN, team="", is_active=True, password_hash="",
        )
        mgr = MagicMock()
        mgr.enabled = True
        mgr.verify_token = AsyncMock(return_value=user)

        app = _make_app(auth_manager=mgr)
        client = TestClient(app)
        resp = client.get("/api/test", headers={"Authorization": "Bearer valid-token"})
        assert resp.status_code == 200
        assert resp.json()["user"] == "testuser"

    def test_api_key_auth(self):
        user = User(
            id=2, username="apiuser", email="a@t.com",
            role=Role.ENGINEER, team="", is_active=True, password_hash="",
        )
        mgr = MagicMock()
        mgr.enabled = True
        mgr.verify_token = AsyncMock(return_value=None)
        mgr.verify_api_key = AsyncMock(return_value=user)

        app = _make_app(auth_manager=mgr)
        client = TestClient(app)
        resp = client.get("/api/test", headers={"X-Api-Key": "ctx_testkey"})
        assert resp.status_code == 200
        assert resp.json()["user"] == "apiuser"


class TestRateLimitMiddleware:
    def test_under_limit(self):
        app = _make_app(rate_limit=10)
        client = TestClient(app)
        for _ in range(5):
            resp = client.get("/api/test")
            assert resp.status_code == 200

    def test_over_limit(self):
        app = _make_app(rate_limit=3)
        client = TestClient(app)
        for _ in range(3):
            resp = client.get("/api/test")
            assert resp.status_code == 200

        resp = client.get("/api/test")
        assert resp.status_code == 429
        assert "Rate limit" in resp.json()["detail"]
