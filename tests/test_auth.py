"""Tests for maestro.auth."""

from __future__ import annotations

import hashlib
import hmac
import time
from unittest.mock import patch

import aiosqlite
import pytest

from maestro.auth import (
    AuthManager,
    Role,
    User,
    _create_token,
    _hash_password,
    _verify_password,
    _verify_token,
)

pytestmark = pytest.mark.asyncio


class TestPasswordHashing:
    def test_bcrypt_hash_verify(self):
        hashed = _hash_password("secret123")
        assert hashed.startswith("$2b$")
        is_valid, needs_rehash = _verify_password("secret123", hashed)
        assert is_valid is True
        assert needs_rehash is False

    def test_bcrypt_wrong_password(self):
        hashed = _hash_password("secret123")
        is_valid, needs_rehash = _verify_password("wrong", hashed)
        assert is_valid is False
        assert needs_rehash is False

    def test_legacy_sha256_compat(self):
        """Legacy SHA-256 hashes should still verify and flag needs_rehash."""
        import secrets as _secrets

        salt = _secrets.token_hex(16)
        h = hashlib.sha256(f"{salt}:mypassword".encode()).hexdigest()
        legacy_hash = f"{salt}:{h}"

        is_valid, needs_rehash = _verify_password("mypassword", legacy_hash)
        assert is_valid is True
        assert needs_rehash is True

    def test_legacy_sha256_wrong_password(self):
        import secrets as _secrets

        salt = _secrets.token_hex(16)
        h = hashlib.sha256(f"{salt}:mypassword".encode()).hexdigest()
        legacy_hash = f"{salt}:{h}"

        is_valid, needs_rehash = _verify_password("wrong", legacy_hash)
        assert is_valid is False
        assert needs_rehash is False

    def test_invalid_hash_format(self):
        is_valid, needs_rehash = _verify_password("test", "nocolonhere")
        assert is_valid is False
        assert needs_rehash is False


class TestJWT:
    def test_create_and_verify(self):
        token = _create_token(1, "admin", "admin")
        payload = _verify_token(token)
        assert payload is not None
        assert payload["uid"] == 1
        assert payload["usr"] == "admin"
        assert payload["rol"] == "admin"

    def test_expired_token(self):
        with patch("maestro.auth.time") as mock_time:
            mock_time.time.return_value = time.time() - 100000
            token = _create_token(1, "admin", "admin")

        payload = _verify_token(token)
        assert payload is None

    def test_tampered_token(self):
        token = _create_token(1, "admin", "admin")
        tampered = token[:-4] + "XXXX"
        payload = _verify_token(tampered)
        assert payload is None

    def test_garbage_token(self):
        payload = _verify_token("not.a.real.token")
        assert payload is None


class TestRBAC:
    def test_admin_has_all_permissions(self):
        user = User(
            id=1, username="admin", email="a@b.com",
            role=Role.ADMIN, team="", is_active=True, password_hash="",
        )
        assert user.has_permission("issues.read")
        assert user.has_permission("users.write")
        assert user.has_permission("secrets.write")

    def test_viewer_limited_permissions(self):
        user = User(
            id=2, username="viewer", email="v@b.com",
            role=Role.VIEWER, team="", is_active=True, password_hash="",
        )
        assert user.has_permission("issues.read")
        assert not user.has_permission("issues.write")
        assert not user.has_permission("users.read")

    def test_engineer_permissions(self):
        user = User(
            id=3, username="eng", email="e@b.com",
            role=Role.ENGINEER, team="", is_active=True, password_hash="",
        )
        assert user.has_permission("issues.read")
        assert user.has_permission("issues.write")
        assert not user.has_permission("issues.delete")
        assert not user.has_permission("users.write")


class TestAuthManager:
    async def test_create_user(self, db: aiosqlite.Connection):
        mgr = AuthManager(db, enabled=True)
        user = await mgr.create_user("alice", "alice@test.com", "pass123", Role.ENGINEER)
        assert user.username == "alice"
        assert user.role == Role.ENGINEER
        assert user.is_active is True

    async def test_authenticate_success(self, db: aiosqlite.Connection):
        mgr = AuthManager(db, enabled=True)
        await mgr.create_user("bob", "bob@test.com", "pass456", Role.ADMIN)

        result = await mgr.authenticate("bob", "pass456")
        assert result is not None
        user, token = result
        assert user.username == "bob"
        assert isinstance(token, str)

    async def test_authenticate_wrong_password(self, db: aiosqlite.Connection):
        mgr = AuthManager(db, enabled=True)
        await mgr.create_user("carol", "carol@test.com", "right", Role.VIEWER)

        result = await mgr.authenticate("carol", "wrong")
        assert result is None

    async def test_authenticate_nonexistent_user(self, db: aiosqlite.Connection):
        mgr = AuthManager(db, enabled=True)
        result = await mgr.authenticate("nobody", "pass")
        assert result is None

    async def test_verify_token_roundtrip(self, db: aiosqlite.Connection):
        mgr = AuthManager(db, enabled=True)
        await mgr.create_user("dave", "dave@test.com", "pass", Role.ADMIN)
        result = await mgr.authenticate("dave", "pass")
        assert result is not None
        _, token = result

        user = await mgr.verify_token(token)
        assert user is not None
        assert user.username == "dave"

    async def test_list_users(self, db: aiosqlite.Connection):
        mgr = AuthManager(db, enabled=True)
        await mgr.create_user("u1", "u1@test.com", "p", Role.ADMIN)
        await mgr.create_user("u2", "u2@test.com", "p", Role.VIEWER)

        users = await mgr.list_users()
        assert len(users) == 2

    async def test_initialize_creates_admin(self, db: aiosqlite.Connection):
        mgr = AuthManager(db, enabled=True)
        await mgr.initialize()

        users = await mgr.list_users()
        assert len(users) == 1
        assert users[0].username == "admin"
        assert users[0].role == Role.ADMIN

    async def test_transparent_password_migration(self, db: aiosqlite.Connection):
        """Legacy SHA-256 passwords should be migrated to bcrypt on login."""
        import secrets as _secrets

        mgr = AuthManager(db, enabled=True)

        # Manually insert a user with a legacy SHA-256 hash
        salt = _secrets.token_hex(16)
        h = hashlib.sha256(f"{salt}:legacypass".encode()).hexdigest()
        legacy_hash = f"{salt}:{h}"

        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            """INSERT INTO users (username, email, password_hash, role, team, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
            ("legacy_user", "legacy@test.com", legacy_hash, "admin", "", now, now),
        )
        await db.commit()

        # Authenticate should succeed and migrate the hash
        result = await mgr.authenticate("legacy_user", "legacypass")
        assert result is not None

        # Verify the hash was updated to bcrypt
        async with db.execute(
            "SELECT password_hash FROM users WHERE username = 'legacy_user'"
        ) as cursor:
            row = await cursor.fetchone()
        assert row["password_hash"].startswith("$2b$")
