"""Tests for maestro.secrets."""

from __future__ import annotations

import aiosqlite
import pytest

from maestro.secrets import SecretManager, _xor_decrypt, _xor_encrypt

pytestmark = pytest.mark.asyncio


class TestXORCipher:
    def test_roundtrip(self):
        key = "test-encryption-key"
        plaintext = "my-secret-value-123"
        encrypted = _xor_encrypt(plaintext, key)
        assert encrypted != plaintext
        decrypted = _xor_decrypt(encrypted, key)
        assert decrypted == plaintext

    def test_different_keys_produce_different_output(self):
        plaintext = "same-data"
        enc1 = _xor_encrypt(plaintext, "key1")
        enc2 = _xor_encrypt(plaintext, "key2")
        assert enc1 != enc2


class TestSecretManager:
    async def test_set_and_get_secret(self, db: aiosqlite.Connection):
        mgr = SecretManager(db)
        await mgr.set_secret("API_KEY", "sk-12345", description="Test key")
        value = await mgr.get_secret("API_KEY")
        assert value == "sk-12345"

    async def test_update_secret(self, db: aiosqlite.Connection):
        mgr = SecretManager(db)
        await mgr.set_secret("TOKEN", "old-value")
        await mgr.set_secret("TOKEN", "new-value")
        value = await mgr.get_secret("TOKEN")
        assert value == "new-value"

    async def test_delete_secret(self, db: aiosqlite.Connection):
        mgr = SecretManager(db)
        await mgr.set_secret("TEMP", "value")
        await mgr.delete_secret("TEMP")
        value = await mgr.get_secret("TEMP")
        assert value is None

    async def test_list_secrets_no_values(self, db: aiosqlite.Connection):
        mgr = SecretManager(db)
        await mgr.set_secret("SECRET_A", "val_a", description="Desc A")
        await mgr.set_secret("SECRET_B", "val_b", description="Desc B")

        secrets = await mgr.list_secrets()
        assert len(secrets) == 2
        names = {s["name"] for s in secrets}
        assert names == {"SECRET_A", "SECRET_B"}
        # Values should not be exposed
        for s in secrets:
            assert "encrypted_value" not in s
            assert "value" not in s

    async def test_get_env_for_runner(self, db: aiosqlite.Connection):
        mgr = SecretManager(db)
        await mgr.set_secret("my-api.key", "secret-val")

        env = await mgr.get_env_for_runner()
        assert "MY_API_KEY" in env
        assert env["MY_API_KEY"] == "secret-val"

    async def test_get_nonexistent_secret(self, db: aiosqlite.Connection):
        mgr = SecretManager(db)
        value = await mgr.get_secret("DOES_NOT_EXIST")
        assert value is None

    async def test_encrypt_decrypt_roundtrip(self, db: aiosqlite.Connection):
        mgr = SecretManager(db)
        original = "sensitive-data-12345"
        encrypted = mgr._encrypt(original)
        assert encrypted != original
        decrypted = mgr._decrypt(encrypted)
        assert decrypted == original
