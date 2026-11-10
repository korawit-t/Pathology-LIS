"""Rate-limit keys for the routes only a signed-in session can reach.

slowapi's default key is the client address. That suits a caller nobody knows
yet (login keeps it), and goes wrong once the caller holds a session: every
client behind one address then shares one bucket. Docker Desktop shows the
backend the same address for every machine on the LAN, because it does not
pass the source address through to the container, and NAT or a reverse proxy
missing from TRUSTED_PROXY_IPS does the same. Keyed per address there, the
20-a-minute cap on /auth/refresh was the allowance of the whole hospital;
once colleagues' tabs had used it up, the next refresh was answered 429 and
that user was signed out in the middle of their work.

These key on the user named in the session's own token instead. A token only
becomes a key once its signature, expiry and type check out, so nobody can
mint a fresh bucket by making a token up, nor spend someone else's without
already holding their session. Anything that does not verify falls back to
the address, and the route itself is about to refuse that request anyway.
"""

from typing import Optional

from jose import JWTError, jwt
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.security import ALGORITHM, SECRET_KEY


def _verified_subject(token: Optional[str], token_type: str) -> Optional[str]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != token_type:
        return None
    subject = payload.get("sub")
    return subject if isinstance(subject, str) and subject else None


def refresh_token_user_key(request: Request) -> str:
    """For /auth/refresh: the user whose refresh cookie is being redeemed."""
    subject = _verified_subject(request.cookies.get("refresh_token"), "refresh")
    return f"user:{subject}" if subject else get_remote_address(request)


def signed_in_user_key(request: Request) -> str:
    """For routes behind get_current_user: the user the access token names.

    Reads the token from the same two places get_current_user does, cookie
    first, then the Bearer header.
    """
    token = request.cookies.get("access_token")
    if not token:
        authorization = request.headers.get("authorization", "")
        if authorization.startswith("Bearer "):
            token = authorization[7:]
    subject = _verified_subject(token, "access")
    return f"user:{subject}" if subject else get_remote_address(request)
