"""Authentication, RBAC, and API key management."""

from __future__ import annotations

import enum
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import aiosqlite

logger = logging.getLogger(__name__)

# JWT-like token using HMAC-SHA256, no external deps
_SECRET_KEY = os.environ.get("CORTEX_JWT_SECRET", secrets.token_hex(32))
_TOKEN_EXPIRY_SECONDS = 86400  # 24h


class Role(str, enum.Enum):
    ADMIN = "admin"
    ENGINEER = "engineer"
    VIEWER = "viewer"


PERMISSIONS: dict[Role, set[str]] = {
    Role.ADMIN: {
        "issues.read", "issues.write", "issues.delete",
        "pipelines.read", "pipelines.write", "pipelines.delete",
        "config.read", "config.write",
        "security.read", "security.write",
        "mcp.read", "mcp.write",
        "audit.read", "audit.export",
        "users.read", "users.write",
        "secrets.read", "secrets.write",
    },
    Role.ENGINEER: {
        "issues.read", "issues.write",
        "pipelines.read", "pipelines.write",
        "config.read",
        "mcp.read",
        "audit.read",
    },
    Role.VIEWER: {
        "issues.read",
        "pipelines.read",
        "config.read",
        "audit.read",
    },
}


@dataclass
class User:
    id: int
    username: str
    email: str
    role: Role
    team: str
    is_active: bool
    password_hash: str
    created_at: str = ""
    updated_at: str = ""

    def has_permission(self, perm: str) -> bool:
        """Check if the user has a specific permission."""
        return perm in PERMISSIONS.get(self.role, set())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "role": self.role.value,
            "team": self.team,
            "is_active": self.is_active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class APIKey:
    id: int
    name: str
    key_prefix: str
    user_id: int
    permissions: list[str]
    expires_at: str | None
    created_at: str
    last_used_at: str | None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "key_prefix": self.key_prefix,
            "user_id": self.user_id,
            "permissions": self.permissions,
            "expires_at": self.expires_at,
            "created_at": self.created_at,
            "last_used_at": self.last_used_at,
        }


def _hash_password(password: str) -> str:
    """Hash a password using SHA-256 with salt."""
    salt = secrets.token_hex(16)
    h = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}:{h}"


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored hash."""
    parts = stored_hash.split(":", 1)
    if len(parts) != 2:
        return False
    salt, expected = parts
    actual = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return hmac.compare_digest(actual, expected)


def _create_token(user_id: int, username: str, role: str) -> str:
    """Create a JWT-like HMAC token."""
    payload = json.dumps({
        "uid": user_id,
        "usr": username,
        "rol": role,
        "exp": int(time.time()) + _TOKEN_EXPIRY_SECONDS,
    })
    import base64
    b64_payload = base64.urlsafe_b64encode(payload.encode()).decode()
    sig = hmac.new(_SECRET_KEY.encode(), b64_payload.encode(), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"


def _verify_token(token: str) -> dict | None:
    """Verify a JWT-like HMAC token. Returns payload dict or None."""
    parts = token.split(".", 1)
    if len(parts) != 2:
        return None
    b64_payload, sig = parts
    expected_sig = hmac.new(_SECRET_KEY.encode(), b64_payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None
    import base64
    try:
        payload = json.loads(base64.urlsafe_b64decode(b64_payload))
    except Exception:
        return None
    if payload.get("exp", 0) < int(time.time()):
        return None
    return payload


class AuthManager:
    """Manages authentication, users, and API keys."""

    def __init__(self, db: aiosqlite.Connection, enabled: bool = False) -> None:
        self._db = db
        self.enabled = enabled

    async def initialize(self) -> None:
        """Create default admin user if none exists."""
        async with self._db.execute("SELECT COUNT(*) as cnt FROM users") as cursor:
            row = await cursor.fetchone()
            count = row["cnt"] if row else 0

        if count == 0:
            default_password = os.environ.get("CORTEX_ADMIN_PASSWORD", "admin")
            await self.create_user(
                username="admin",
                email="admin@cortex.local",
                password=default_password,
                role=Role.ADMIN,
                team="platform",
            )
            logger.info("Default admin user created (username: admin)")

    async def create_user(
        self,
        username: str,
        email: str,
        password: str,
        role: Role = Role.ENGINEER,
        team: str = "",
    ) -> User:
        """Create a new user."""
        now = datetime.now(timezone.utc).isoformat()
        password_hash = _hash_password(password)

        cursor = await self._db.execute(
            """INSERT INTO users (username, email, password_hash, role, team, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
            (username, email, password_hash, role.value, team, now, now),
        )
        await self._db.commit()

        user = await self._get_user_by_id(cursor.lastrowid)
        assert user is not None
        return user

    async def authenticate(self, username: str, password: str) -> tuple[User, str] | None:
        """Authenticate a user and return (User, jwt_token) or None."""
        async with self._db.execute(
            "SELECT * FROM users WHERE username = ? AND is_active = 1",
            (username,),
        ) as cursor:
            row = await cursor.fetchone()

        if row is None:
            return None

        user = self._row_to_user(dict(row))
        if not _verify_password(password, user.password_hash):
            return None

        token = _create_token(user.id, user.username, user.role.value)
        return user, token

    async def verify_token(self, token: str) -> User | None:
        """Verify a JWT token and return the User or None."""
        payload = _verify_token(token)
        if payload is None:
            return None
        return await self._get_user_by_id(payload.get("uid"))

    async def verify_api_key(self, key: str) -> User | None:
        """Verify an API key and return the associated User or None."""
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        async with self._db.execute(
            "SELECT * FROM api_keys WHERE key_hash = ?", (key_hash,)
        ) as cursor:
            row = await cursor.fetchone()

        if row is None:
            return None

        row_dict = dict(row)

        # Check expiry
        if row_dict.get("expires_at"):
            expires = datetime.fromisoformat(row_dict["expires_at"])
            if expires < datetime.now(timezone.utc):
                return None

        # Update last_used_at
        now = datetime.now(timezone.utc).isoformat()
        await self._db.execute(
            "UPDATE api_keys SET last_used_at = ? WHERE id = ?",
            (now, row_dict["id"]),
        )
        await self._db.commit()

        return await self._get_user_by_id(row_dict["user_id"])

    async def create_api_key(
        self,
        user_id: int,
        name: str,
        expires_days: int | None = None,
    ) -> tuple[str, APIKey]:
        """Create an API key. Returns (raw_key, APIKey)."""
        raw_key = f"ctx_{secrets.token_hex(24)}"
        key_prefix = raw_key[:8]
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        now = datetime.now(timezone.utc).isoformat()

        expires_at = None
        if expires_days:
            from datetime import timedelta
            expires_at = (datetime.now(timezone.utc) + timedelta(days=expires_days)).isoformat()

        cursor = await self._db.execute(
            """INSERT INTO api_keys (name, key_prefix, key_hash, user_id, permissions, expires_at, created_at)
               VALUES (?, ?, ?, ?, '[]', ?, ?)""",
            (name, key_prefix, key_hash, user_id, expires_at, now),
        )
        await self._db.commit()

        api_key = APIKey(
            id=cursor.lastrowid,
            name=name,
            key_prefix=key_prefix,
            user_id=user_id,
            permissions=[],
            expires_at=expires_at,
            created_at=now,
            last_used_at=None,
        )
        return raw_key, api_key

    async def list_users(self) -> list[User]:
        """List all users."""
        async with self._db.execute("SELECT * FROM users ORDER BY id") as cursor:
            rows = await cursor.fetchall()
        return [self._row_to_user(dict(row)) for row in rows]

    async def _get_user_by_id(self, user_id: int) -> User | None:
        async with self._db.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_user(dict(row))

    @staticmethod
    def _row_to_user(row: dict) -> User:
        return User(
            id=row["id"],
            username=row["username"],
            email=row["email"],
            role=Role(row["role"]),
            team=row.get("team", ""),
            is_active=bool(row["is_active"]),
            password_hash=row["password_hash"],
            created_at=row.get("created_at", ""),
            updated_at=row.get("updated_at", ""),
        )
