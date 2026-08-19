"""Encryption for stored MFA secrets.

A TOTP secret is a bearer credential: anyone holding it can generate valid
codes forever. It has to be readable by the server on every login, so it cannot
be hashed the way a password is — it is encrypted instead.

Be honest about what that buys. This protects a database-only disclosure: a
stolen backup, a dump pulled through an injection, a decommissioned disk. It
does **not** protect against a compromised application host, because a host
that can read the key can decrypt everything. Making that stronger means a KMS
or an HSM, which is disproportionate for a LAN-deployed lab system.

The key is deliberately its own environment variable rather than something
derived from SECRET_KEY:

  * Key separation. SECRET_KEY signs JWTs; a signing key and an encryption key
    should not be the same material.
  * Rotation. SECRET_KEY is the one key here that genuinely may need rotating —
    after a leak, or when someone leaves. If TOTP secrets hung off it, rotating
    it would make every enrolled factor undecryptable at once and lock out
    every user who had set one up.

MFA_ENCRYPTION_KEY may hold several comma-separated keys. The first is used for
new encryptions and all of them are tried when decrypting, which is what makes
rotating it possible without downtime: prepend a new key, let logins re-encrypt
over time, drop the old one when nothing needs it.

Nothing here is loaded at import. MFA ships switched off, and an installation
that never turns it on must not be made to invent a key — so a missing key is
an error at the point of use, not a refusal to boot.
"""

import os

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

ENV_VAR = "MFA_ENCRYPTION_KEY"

_GENERATE_HINT = (
    "Generate one with:\n"
    '    python -c "from cryptography.fernet import Fernet; '
    'print(Fernet.generate_key().decode())"'
)

# Cached against the raw environment value, so changing the variable — which in
# practice means a test — rebuilds rather than silently serving the old key.
_cache: tuple[str, MultiFernet] | None = None


class MfaEncryptionKeyError(RuntimeError):
    """MFA_ENCRYPTION_KEY is missing or unusable."""


def is_configured() -> bool:
    """Whether a key is present, without raising.

    For settings screens and health checks that want to report on MFA
    readiness rather than fail on it.
    """
    return bool(os.getenv(ENV_VAR, "").strip())


def _load() -> MultiFernet:
    global _cache

    raw = os.getenv(ENV_VAR, "").strip()
    if not raw:
        raise MfaEncryptionKeyError(
            f"{ENV_VAR} is not set, and multi-factor authentication needs it to "
            f"store TOTP secrets.\n{_GENERATE_HINT}"
        )

    if _cache is not None and _cache[0] == raw:
        return _cache[1]

    keys = [part.strip() for part in raw.split(",") if part.strip()]
    try:
        fernets = [Fernet(key.encode()) for key in keys]
    except (ValueError, TypeError) as exc:
        raise MfaEncryptionKeyError(
            f"{ENV_VAR} is not a valid Fernet key (expected 32 url-safe "
            f"base64-encoded bytes). Note this is NOT the same format as "
            f"SECRET_KEY, and must not be the same value.\n{_GENERATE_HINT}"
        ) from exc

    multi = MultiFernet(fernets)
    _cache = (raw, multi)
    return multi


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a TOTP secret for storage in user_mfa_methods.secret_enc."""
    return _load().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    """Recover a stored TOTP secret.

    Raises MfaEncryptionKeyError if the value cannot be decrypted with any
    configured key — a rotated-away key that was dropped too early, or a row
    written under a different key entirely. That is deliberately not a silent
    failure: it means the factor is unusable and the user needs re-enrolling.
    """
    try:
        return _load().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise MfaEncryptionKeyError(
            f"a stored MFA secret could not be decrypted with any key in {ENV_VAR}. "
            "If a key was recently rotated out, add it back as a trailing entry; "
            "otherwise the affected users have to enrol again."
        ) from exc


def rotate_secret(token: str) -> str:
    """Re-encrypt an existing value under the current primary key.

    Lets a rotation finish without asking anyone to re-enrol: decrypt with
    whichever key still works, hand back a value encrypted under the first.
    """
    return encrypt_secret(decrypt_secret(token))
