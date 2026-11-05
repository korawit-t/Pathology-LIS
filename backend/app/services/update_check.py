"""Is a newer release of this LIS out than the one running here?

Compares settings.VERSION with the latest GitHub release of
settings.UPDATE_CHECK_REPO, for the admin's "update available" notice.
Releases, not commits on main: a release is what someone decided is ready to
deploy, and its MAJOR number says whether the upgrade needs a human (see
CHANGELOG.md), so an install is never told to chase every merge.

The answer is cached in this process, so however many admins open the app
GitHub sees at most one request per SUCCESS_TTL — well inside the 60 an hour
it allows a single IP without a token. A failed lookup is cached for a shorter
time, so a server with no internet doesn't retry on every page load.
"""

import logging
import re
import threading
import time
from datetime import datetime, timezone

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
REQUEST_TIMEOUT_SECONDS = 5.0
SUCCESS_TTL_SECONDS = 6 * 60 * 60
FAILURE_TTL_SECONDS = 30 * 60

_SEMVER_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")

_lock = threading.Lock()
_cached: dict | None = None
_cached_until = 0.0


def parse_version(value: str | None) -> tuple[int, int, int] | None:
    """(major, minor, patch) for "3.0.0" or "v3.0.0"; None for anything else."""
    match = _SEMVER_RE.match((value or "").strip())
    if not match:
        return None
    major, minor, patch = (int(part) for part in match.groups())
    return major, minor, patch


def _fetch_latest_release(repo: str) -> httpx.Response:
    # Proxies come from HTTPS_PROXY / HTTP_PROXY as usual (httpx trust_env).
    return httpx.get(
        f"{GITHUB_API}/repos/{repo}/releases/latest",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": f"pathology-lis/{settings.VERSION}",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
        follow_redirects=True,
    )


def _status(**fields) -> dict:
    status = {
        "enabled": True,
        "repo": settings.UPDATE_CHECK_REPO,
        "current_version": settings.VERSION,
        "latest_version": None,
        "update_available": False,
        "major_update": False,
        "release_url": None,
        "published_at": None,
        "checked_at": datetime.now(timezone.utc),
        "error": None,
    }
    status.update(fields)
    return status


def _check(repo: str) -> tuple[dict, int]:
    """(status, seconds to cache it)."""
    try:
        response = _fetch_latest_release(repo)
    except httpx.HTTPError as exc:
        logger.warning("Update check: could not reach GitHub for %s: %s", repo, exc)
        return _status(error="unreachable"), FAILURE_TTL_SECONDS

    if response.status_code == 404:
        # The repository exists but has published no release yet, or the
        # name is wrong. Either way there is nothing to compare against.
        return _status(error="no_release"), FAILURE_TTL_SECONDS
    if response.status_code in (403, 429):
        logger.warning("Update check: GitHub refused the request (%s)", response.status_code)
        return _status(error="rate_limited"), FAILURE_TTL_SECONDS
    if response.status_code != 200:
        logger.warning("Update check: GitHub answered %s for %s", response.status_code, repo)
        return _status(error="bad_response"), FAILURE_TTL_SECONDS

    try:
        release = response.json()
        tag = str(release["tag_name"])
    except (ValueError, KeyError, TypeError):
        logger.warning("Update check: GitHub's release answer for %s had no tag_name", repo)
        return _status(error="bad_response"), FAILURE_TTL_SECONDS

    latest = parse_version(tag)
    current = parse_version(settings.VERSION)
    newer = latest is not None and current is not None and latest > current
    return (
        _status(
            latest_version=tag.lstrip("v"),
            update_available=newer,
            major_update=newer and latest[0] > current[0],
            release_url=release.get("html_url"),
            published_at=release.get("published_at"),
            # A tag that isn't plain MAJOR.MINOR.PATCH can't be ranked.
            error=None if latest is not None else "bad_response",
        ),
        SUCCESS_TTL_SECONDS,
    )


def get_update_status() -> dict:
    global _cached, _cached_until

    repo = settings.UPDATE_CHECK_REPO
    if not repo:
        return _status(enabled=False, checked_at=None)

    with _lock:
        now = time.monotonic()
        if _cached is not None and now < _cached_until:
            return _cached
        status, ttl = _check(repo)
        _cached, _cached_until = status, now + ttl
        return status


def reset_cache() -> None:
    global _cached, _cached_until
    with _lock:
        _cached, _cached_until = None, 0.0
