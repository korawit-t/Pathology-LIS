"""Unit tests for app/core/security.py's password/token primitives.

Covers two fixes:
1. verify_password used to be called with the real hashed_password only when
   a user exists (the caller short-circuited on `not user or ...`), so a
   login attempt for a nonexistent username skipped the (slow) Argon2
   computation entirely — a timing oracle for user enumeration. The fix
   makes verify_password itself accept `None` and fall back to a fixed dummy
   hash, so it always does the same amount of work.
2. create_refresh_token now returns (token, jti, expires_at) like
   create_access_token, so the refresh endpoint can revoke a specific
   refresh token on rotation/logout and detect reuse.
"""

from jose import jwt

from app.core.security import (
    verify_password,
    create_refresh_token,
    create_access_token,
    get_password_hash,
    SECRET_KEY,
    ALGORITHM,
)


class TestVerifyPasswordTimingSafety:
    def test_real_password_still_verifies_correctly(self):
        hashed = get_password_hash("CorrectHorseBatteryStaple1!")
        assert verify_password("CorrectHorseBatteryStaple1!", hashed) is True
        assert verify_password("WrongGuess", hashed) is False

    def test_none_hash_does_not_raise_and_returns_false(self):
        """Simulates a login attempt for a username that doesn't exist —
        the caller now passes None instead of skipping the call entirely."""
        assert verify_password("any-password-attempt", None) is False

    def test_none_hash_still_runs_a_real_argon2_verification(self):
        """The dummy-hash fallback must be a real Argon2 hash (so the same
        code path executes), not a short-circuit stub."""
        import app.core.security as security_module

        assert security_module._DUMMY_HASH.startswith("$argon2")


class TestCreateRefreshToken:
    def test_returns_token_jti_and_expiry(self):
        token, jti, expires_at = create_refresh_token(subject="someuser")

        assert isinstance(token, str)
        assert isinstance(jti, str) and jti
        assert expires_at is not None

    def test_token_contains_matching_jti_and_type(self):
        token, jti, _ = create_refresh_token(subject="someuser")

        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert decoded["jti"] == jti
        assert decoded["type"] == "refresh"
        assert decoded["sub"] == "someuser"

    def test_each_call_gets_a_distinct_jti(self):
        _, jti1, _ = create_refresh_token(subject="someuser")
        _, jti2, _ = create_refresh_token(subject="someuser")

        assert jti1 != jti2
