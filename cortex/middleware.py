"""FastAPI middleware for auth and rate limiting."""

from __future__ import annotations

import logging
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Paths that do not require authentication
PUBLIC_PATHS = {
    "/api/health",
    "/api/auth/login",
    "/ws",
    "/",
    "/static",
    "/docs",
    "/openapi.json",
}


class AuthMiddleware(BaseHTTPMiddleware):
    """Authentication middleware for FastAPI.

    If auth disabled: sets anonymous admin user on request.state.
    If auth enabled: verifies Bearer token or ApiKey header.
    """

    def __init__(self, app, auth_manager=None) -> None:
        super().__init__(app)
        self._auth_manager = auth_manager

    async def dispatch(self, request: Request, call_next):
        # Set default anonymous user
        request.state.user = None

        if self._auth_manager is None or not self._auth_manager.enabled:
            # Auth disabled -- set anonymous admin-like user
            from cortex.auth import User, Role
            request.state.user = User(
                id=0,
                username="anonymous",
                email="anonymous@localhost",
                role=Role.ADMIN,
                team="",
                is_active=True,
                password_hash="",
            )
            return await call_next(request)

        # Check if path is public
        path = request.url.path
        if any(path == p or (p != "/" and path.startswith(p)) for p in PUBLIC_PATHS):
            return await call_next(request)

        # Try Bearer token
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            user = await self._auth_manager.verify_token(token)
            if user:
                request.state.user = user
                return await call_next(request)

        # Try ApiKey header
        api_key = request.headers.get("x-api-key", "")
        if api_key:
            user = await self._auth_manager.verify_api_key(api_key)
            if user:
                request.state.user = user
                return await call_next(request)

        # Try query param token (for WebSocket)
        token_param = request.query_params.get("token", "")
        if token_param:
            user = await self._auth_manager.verify_token(token_param)
            if user:
                request.state.user = user
                return await call_next(request)

        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
        )


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Token-bucket rate limiter per IP address."""

    def __init__(self, app, requests_per_minute: int = 120) -> None:
        super().__init__(app)
        self._rate = requests_per_minute
        self._buckets: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()

        # Clean old entries (older than 60 seconds)
        self._buckets[client_ip] = [
            t for t in self._buckets[client_ip] if now - t < 60.0
        ]

        if len(self._buckets[client_ip]) >= self._rate:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
            )

        self._buckets[client_ip].append(now)
        return await call_next(request)
