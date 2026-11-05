"""GET /version/update-status and app/services/update_check.py.

GitHub is never called: _fetch_latest_release is replaced with canned
httpx responses.
"""

import httpx
import pytest

from app.core.config import parse_update_check_repo, settings
from app.services import update_check

URL = "/version/update-status"
RELEASE_URL = "https://github.com/korawit-t/Pathology-LIS/releases/tag/v3.1.0"


@pytest.fixture(autouse=True)
def _fresh(monkeypatch):
    monkeypatch.setattr(settings, "UPDATE_CHECK_REPO", "korawit-t/Pathology-LIS")
    monkeypatch.setattr(settings, "VERSION", "3.0.0")
    update_check.reset_cache()
    yield
    update_check.reset_cache()


def _respond(monkeypatch, status_code=200, payload=None, exc=None):
    calls = []

    def fake(repo):
        calls.append(repo)
        if exc is not None:
            raise exc
        request = httpx.Request("GET", f"https://api.github.com/repos/{repo}/releases/latest")
        return httpx.Response(status_code, json=payload, request=request)

    monkeypatch.setattr(update_check, "_fetch_latest_release", fake)
    return calls


def _release(tag):
    return {"tag_name": tag, "html_url": RELEASE_URL, "published_at": "2026-11-20T03:00:00Z"}


class TestCompare:
    @pytest.mark.parametrize(
        "tag, update, major",
        [
            ("v3.0.0", False, False),
            ("v3.0.1", True, False),
            ("v3.1.0", True, False),
            ("v4.0.0", True, True),
            ("v2.9.9", False, False),
            ("3.2.0", True, False),
        ],
    )
    def test_ranks_the_latest_tag_against_the_running_version(self, monkeypatch, tag, update, major):
        _respond(monkeypatch, payload=_release(tag))
        status = update_check.get_update_status()
        assert status["latest_version"] == tag.lstrip("v")
        assert status["update_available"] is update
        assert status["major_update"] is major
        assert status["error"] is None

    def test_an_unrankable_tag_is_reported_not_flagged(self, monkeypatch):
        _respond(monkeypatch, payload=_release("nightly-2026-11-20"))
        status = update_check.get_update_status()
        assert status["update_available"] is False
        assert status["error"] == "bad_response"

    def test_release_link_and_date_come_through(self, monkeypatch):
        _respond(monkeypatch, payload=_release("v3.1.0"))
        status = update_check.get_update_status()
        assert status["release_url"] == RELEASE_URL
        assert status["published_at"] == "2026-11-20T03:00:00Z"
        assert status["current_version"] == "3.0.0"


class TestFailures:
    def test_network_error(self, monkeypatch):
        _respond(monkeypatch, exc=httpx.ConnectError("no route to host"))
        status = update_check.get_update_status()
        assert status["error"] == "unreachable"
        assert status["update_available"] is False

    @pytest.mark.parametrize(
        "code, error",
        [(404, "no_release"), (403, "rate_limited"), (429, "rate_limited"), (500, "bad_response")],
    )
    def test_http_errors(self, monkeypatch, code, error):
        _respond(monkeypatch, status_code=code, payload={"message": "x"})
        assert update_check.get_update_status()["error"] == error

    def test_answer_without_a_tag(self, monkeypatch):
        _respond(monkeypatch, payload={"html_url": RELEASE_URL})
        assert update_check.get_update_status()["error"] == "bad_response"


class TestCache:
    def test_one_lookup_serves_later_calls(self, monkeypatch):
        calls = _respond(monkeypatch, payload=_release("v3.1.0"))
        update_check.get_update_status()
        update_check.get_update_status()
        assert len(calls) == 1

    def test_a_failure_is_cached_too(self, monkeypatch):
        calls = _respond(monkeypatch, exc=httpx.ConnectTimeout("timed out"))
        update_check.get_update_status()
        update_check.get_update_status()
        assert len(calls) == 1

    def test_looks_again_once_the_cache_expires(self, monkeypatch):
        calls = _respond(monkeypatch, payload=_release("v3.1.0"))
        clock = [1000.0]
        monkeypatch.setattr(update_check.time, "monotonic", lambda: clock[0])
        update_check.get_update_status()
        clock[0] += update_check.SUCCESS_TTL_SECONDS + 1
        update_check.get_update_status()
        assert len(calls) == 2


class TestDisabled:
    def test_no_lookup_when_switched_off(self, monkeypatch):
        calls = _respond(monkeypatch, payload=_release("v9.0.0"))
        monkeypatch.setattr(settings, "UPDATE_CHECK_REPO", None)
        status = update_check.get_update_status()
        assert status["enabled"] is False
        assert status["update_available"] is False
        assert calls == []

    @pytest.mark.parametrize("raw", ["", "off", "OFF", "false", "none", "0", '""'])
    def test_off_values(self, raw):
        assert parse_update_check_repo(raw) is None

    def test_unset_uses_the_project_repo(self):
        assert parse_update_check_repo(None) == "korawit-t/Pathology-LIS"

    def test_quotes_from_start_ps1_are_stripped(self):
        assert parse_update_check_repo('"someone/fork"') == "someone/fork"

    @pytest.mark.parametrize("raw", ["korawit-t", "https://github.com/a/b", "a/b/c", "a/b?x=1"])
    def test_anything_but_owner_name_refuses_to_start(self, raw):
        with pytest.raises(RuntimeError, match="UPDATE_CHECK_REPO"):
            parse_update_check_repo(raw)


class TestEndpoint:
    def test_admin_gets_the_status(self, admin_client, monkeypatch):
        _respond(monkeypatch, payload=_release("v4.0.0"))
        r = admin_client.get(URL)
        assert r.status_code == 200
        body = r.json()
        assert body["enabled"] is True
        assert body["latest_version"] == "4.0.0"
        assert body["update_available"] is True
        assert body["major_update"] is True
        assert body["release_url"] == RELEASE_URL

    def test_pathologist_is_refused(self, pathologist_client, monkeypatch):
        calls = _respond(monkeypatch, payload=_release("v4.0.0"))
        assert pathologist_client.get(URL).status_code == 403
        assert calls == []

    def test_clinician_is_refused(self, clinician_client, monkeypatch):
        calls = _respond(monkeypatch, payload=_release("v4.0.0"))
        assert clinician_client.get(URL).status_code == 403
        assert calls == []

    def test_needs_a_login(self, client, monkeypatch):
        calls = _respond(monkeypatch, payload=_release("v4.0.0"))
        assert client.get(URL).status_code == 401
        assert calls == []

    def test_public_version_stays_public_and_unchanged(self, client):
        r = client.get("/version")
        assert r.status_code == 200
        assert set(r.json()) == {"version", "environment"}
