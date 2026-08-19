"""Tests for MFA secret encryption.

The properties worth pinning here are the ones that would be discovered late
and painfully: that a missing key fails at the point of use rather than at
import (so installations with MFA switched off still boot), that a wrong key
cannot quietly return rubbish, and that key rotation actually works — since
rotatability is the whole reason this is a separate key from SECRET_KEY.
"""

import pytest
from cryptography.fernet import Fernet


from app.core.mfa_crypto import (
    ENV_VAR,
    MfaEncryptionKeyError,
    decrypt_secret,
    encrypt_secret,
    is_configured,
    rotate_secret,
)

# A real TOTP secret is base32; the exact shape does not matter to Fernet.
SECRET = "JBSWY3DPEHPK3PXP"


@pytest.fixture
def key(monkeypatch):
    value = Fernet.generate_key().decode()
    monkeypatch.setenv(ENV_VAR, value)
    return value


class TestRoundTrip:
    def test_a_secret_survives_encrypt_then_decrypt(self, key):
        assert decrypt_secret(encrypt_secret(SECRET)) == SECRET

    def test_the_ciphertext_does_not_contain_the_secret(self, key):
        assert SECRET not in encrypt_secret(SECRET)

    def test_encrypting_twice_gives_different_ciphertexts(self, key):
        """Fernet embeds a random IV, so equal secrets do not produce equal
        rows — otherwise the table would leak which users share a secret."""
        assert encrypt_secret(SECRET) != encrypt_secret(SECRET)


class TestKeyConfiguration:
    def test_missing_key_raises_only_when_used(self, monkeypatch):
        """Importing the module must not require a key.

        MFA ships switched off; an installation that never enables it should
        not be forced to invent one, and the backend must still boot.
        """
        monkeypatch.delenv(ENV_VAR, raising=False)
        assert is_configured() is False

        with pytest.raises(MfaEncryptionKeyError) as excinfo:
            encrypt_secret(SECRET)
        assert ENV_VAR in str(excinfo.value)
        # The message should say how to produce one.
        assert "Fernet.generate_key" in str(excinfo.value)

    def test_blank_key_counts_as_missing(self, monkeypatch):
        monkeypatch.setenv(ENV_VAR, "   ")
        assert is_configured() is False
        with pytest.raises(MfaEncryptionKeyError):
            encrypt_secret(SECRET)

    def test_a_malformed_key_is_rejected_clearly(self, monkeypatch):
        """The likeliest mistake is pasting a SECRET_KEY, which is hex of a
        different length and not a valid Fernet key."""
        monkeypatch.setenv(ENV_VAR, "a" * 64)
        with pytest.raises(MfaEncryptionKeyError) as excinfo:
            encrypt_secret(SECRET)
        assert "not a valid Fernet key" in str(excinfo.value)

    def test_is_configured_is_true_once_a_key_is_present(self, key):
        assert is_configured() is True


class TestWrongKey:
    def test_a_value_from_another_key_will_not_decrypt(self, monkeypatch):
        monkeypatch.setenv(ENV_VAR, Fernet.generate_key().decode())
        token = encrypt_secret(SECRET)

        monkeypatch.setenv(ENV_VAR, Fernet.generate_key().decode())
        with pytest.raises(MfaEncryptionKeyError) as excinfo:
            decrypt_secret(token)
        assert "could not be decrypted" in str(excinfo.value)

    def test_tampered_ciphertext_is_rejected(self, key):
        token = encrypt_secret(SECRET)
        tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
        with pytest.raises(MfaEncryptionKeyError):
            decrypt_secret(tampered)


class TestRotation:
    def test_an_old_secret_still_decrypts_after_a_new_key_is_prepended(self, monkeypatch):
        """The point of allowing several keys: rotate without a flag day, and
        without every enrolled user having to set their factor up again."""
        old = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, old)
        token = encrypt_secret(SECRET)

        new = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, f"{new},{old}")

        assert decrypt_secret(token) == SECRET

    def test_new_encryptions_use_the_first_key(self, monkeypatch):
        old = Fernet.generate_key().decode()
        new = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, f"{new},{old}")
        token = encrypt_secret(SECRET)

        # Dropping the old key must not affect anything written since.
        monkeypatch.setenv(ENV_VAR, new)
        assert decrypt_secret(token) == SECRET

    def test_rotate_secret_moves_a_value_onto_the_current_key(self, monkeypatch):
        old = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, old)
        token = encrypt_secret(SECRET)

        new = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, f"{new},{old}")
        rotated = rotate_secret(token)

        monkeypatch.setenv(ENV_VAR, new)
        assert decrypt_secret(rotated) == SECRET
        # ...whereas the original would now be unreadable.
        with pytest.raises(MfaEncryptionKeyError):
            decrypt_secret(token)

    def test_whitespace_around_keys_is_tolerated(self, monkeypatch):
        """Multi-key values get wrapped and indented in .env files by hand."""
        old = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, old)
        token = encrypt_secret(SECRET)

        new = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, f"  {new} ,  {old}  ")
        assert decrypt_secret(token) == SECRET


class TestKeyCaching:
    def test_changing_the_key_takes_effect_immediately(self, monkeypatch):
        """The loaded key is cached; the cache must key off the env value or a
        rotation would appear to do nothing until the process restarted."""
        first = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, first)
        token_first = encrypt_secret(SECRET)

        second = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, second)
        token_second = encrypt_secret(SECRET)

        monkeypatch.setenv(ENV_VAR, first)
        assert decrypt_secret(token_first) == SECRET
        with pytest.raises(MfaEncryptionKeyError):
            decrypt_secret(token_second)


class TestErrorsDoNotLeakTheKey:
    """Every one of these exceptions is a candidate for a log line.

    The module unavoidably holds the key in memory to do its job, so the
    property worth guaranteeing is narrower: nothing it *raises* carries key
    material into a log, a traceback, or an error response.
    """

    def test_a_malformed_key_is_not_echoed_back(self, monkeypatch):
        bad = "definitely-not-a-fernet-key-but-still-secret"
        monkeypatch.setenv(ENV_VAR, bad)
        with pytest.raises(MfaEncryptionKeyError) as excinfo:
            encrypt_secret(SECRET)
        assert bad not in str(excinfo.value)

    def test_a_failed_decrypt_reveals_neither_key_nor_ciphertext(self, monkeypatch):
        first = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, first)
        token = encrypt_secret(SECRET)

        second = Fernet.generate_key().decode()
        monkeypatch.setenv(ENV_VAR, second)
        with pytest.raises(MfaEncryptionKeyError) as excinfo:
            decrypt_secret(token)

        message = str(excinfo.value)
        assert second not in message
        assert token not in message
        assert SECRET not in message
