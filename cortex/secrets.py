"""Encrypted credential storage."""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
from datetime import datetime, timezone

import aiosqlite

logger = logging.getLogger(__name__)

_ENCRYPTION_KEY = os.environ.get("CORTEX_ENCRYPTION_KEY", "")


def _get_fernet():
    """Try to get a Fernet instance for AES-256 encryption."""
    try:
        from cryptography.fernet import Fernet

        key = _ENCRYPTION_KEY or Fernet.generate_key().decode()
        # Fernet requires a 32-byte URL-safe base64-encoded key
        if len(key) < 32:
            key = base64.urlsafe_b64encode(
                hashlib.sha256(key.encode()).digest()
            ).decode()
        return Fernet(key.encode() if isinstance(key, str) else key)
    except ImportError:
        return None


def _xor_encrypt(data: str, key: str) -> str:
    """Simple XOR-based encryption fallback (not cryptographically strong)."""
    key_bytes = hashlib.sha256(key.encode()).digest()
    data_bytes = data.encode()
    encrypted = bytes(d ^ key_bytes[i % len(key_bytes)] for i, d in enumerate(data_bytes))
    return base64.b64encode(encrypted).decode()


def _xor_decrypt(data: str, key: str) -> str:
    """Decrypt XOR-encrypted data."""
    key_bytes = hashlib.sha256(key.encode()).digest()
    encrypted = base64.b64decode(data)
    decrypted = bytes(d ^ key_bytes[i % len(key_bytes)] for i, d in enumerate(encrypted))
    return decrypted.decode()


class SecretManager:
    """Encrypted credential storage backed by SQLite."""

    def __init__(self, db: aiosqlite.Connection) -> None:
        self._db = db
        self._fernet = _get_fernet()
        self._key = _ENCRYPTION_KEY or secrets.token_hex(32)

    async def initialize(self) -> None:
        """Tables created via SCHEMA in models.py."""
        pass

    def _encrypt(self, value: str) -> str:
        """Encrypt a value."""
        if self._fernet:
            return self._fernet.encrypt(value.encode()).decode()
        return _xor_encrypt(value, self._key)

    def _decrypt(self, encrypted: str) -> str:
        """Decrypt a value."""
        if self._fernet:
            return self._fernet.decrypt(encrypted.encode()).decode()
        return _xor_decrypt(encrypted, self._key)

    async def set_secret(
        self,
        name: str,
        value: str,
        description: str = "",
        created_by: str = "",
    ) -> None:
        """Set or update a secret."""
        now = datetime.now(timezone.utc).isoformat()
        encrypted_value = self._encrypt(value)

        # Upsert
        async with self._db.execute(
            "SELECT id FROM secrets WHERE name = ?", (name,)
        ) as cursor:
            existing = await cursor.fetchone()

        if existing:
            await self._db.execute(
                "UPDATE secrets SET encrypted_value = ?, description = ?, updated_at = ? WHERE name = ?",
                (encrypted_value, description, now, name),
            )
        else:
            await self._db.execute(
                """INSERT INTO secrets (name, encrypted_value, description, created_by, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (name, encrypted_value, description, created_by, now, now),
            )
        await self._db.commit()

    async def get_secret(self, name: str) -> str | None:
        """Get a decrypted secret value by name."""
        async with self._db.execute(
            "SELECT encrypted_value FROM secrets WHERE name = ?", (name,)
        ) as cursor:
            row = await cursor.fetchone()
        if row is None:
            return None
        try:
            return self._decrypt(row["encrypted_value"])
        except Exception:
            logger.error("Failed to decrypt secret: %s", name)
            return None

    async def list_secrets(self) -> list[dict]:
        """List secret names and descriptions (no values)."""
        async with self._db.execute(
            "SELECT name, description, created_by, created_at, updated_at FROM secrets ORDER BY name"
        ) as cursor:
            rows = await cursor.fetchall()
        return [
            {
                "name": row["name"],
                "description": row["description"],
                "created_by": row["created_by"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]

    async def delete_secret(self, name: str) -> None:
        """Delete a secret."""
        await self._db.execute("DELETE FROM secrets WHERE name = ?", (name,))
        await self._db.commit()

    async def get_env_for_runner(self) -> dict[str, str]:
        """Get all secrets as environment variables for runner injection."""
        async with self._db.execute(
            "SELECT name, encrypted_value FROM secrets"
        ) as cursor:
            rows = await cursor.fetchall()

        env: dict[str, str] = {}
        for row in rows:
            try:
                value = self._decrypt(row["encrypted_value"])
                # Convert secret name to env var format: MY_SECRET -> MY_SECRET
                env_key = row["name"].upper().replace("-", "_").replace(".", "_")
                env[env_key] = value
            except Exception:
                logger.debug("Failed to decrypt secret for env: %s", row["name"])
        return env
