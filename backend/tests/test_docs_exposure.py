"""Tests for the EXPOSE_DOCS gate on Swagger UI, ReDoc and the OpenAPI schema.

The property under test is that EXPOSE_DOCS alone decides whether the schema
is served, independently of ENVIRONMENT. That independence is the whole point
of the flag: the two were one setting until 2026-09-30, and because a hospital
LAN serves plain HTTP it must keep ENVIRONMENT=development (backend/.env.example
says so, and production fail-closes on http:// origins), which meant the only
supported way to close the docs was unavailable to the deployment that most
needed it. A LAN install was publishing its full endpoint map — every route,
parameter and model field — unauthenticated to the whole subnet.

Each case boots the app in a fresh interpreter rather than reloading `main`
here. Two reasons: docs_url/redoc_url/openapi_url are fixed when FastAPI() is
constructed at import time, so a different setting is only observable in a new
process; and re-importing `main` into this one would register a second copy of
the audit after_flush listener, silently doubling every audit row for the rest
of the run. Each boot costs a few seconds — results are cached per env combo so
the assertions below share them.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DOC_PATHS = ("/docs", "/redoc", "/openapi.json")

# Imports the app exactly as uvicorn would, then reports what the three doc
# routes actually answer plus any EXPOSE_DOCS warning logged during import.
_PROBE = r'''
import json
import logging

_messages = []


class _Capture(logging.Handler):
    def emit(self, record):
        _messages.append(record.getMessage())


_root = logging.getLogger()
_root.addHandler(_Capture())
_root.setLevel(logging.WARNING)

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

# Deliberately not `with TestClient(app)`: entering the context manager runs
# the lifespan, which starts the HIS-export and scheduled-notification poll
# loops. Routing works without it and this probe has no use for them.
_client = TestClient(app)

print("PROBE_RESULT:" + json.dumps({
    "status": {p: _client.get(p).status_code for p in ("/docs", "/redoc", "/openapi.json")},
    "warnings": [m for m in _messages if "EXPOSE_DOCS" in m],
}))
'''

_CACHE: dict[tuple[str, str | None], dict] = {}


def _boot(environment: str, expose_docs: str | None) -> dict:
    """Import the app in a fresh interpreter; report what the doc routes do.

    `expose_docs=None` means the variable is not set at all, which is the
    case the deployment default rests on.
    """
    key = (environment, expose_docs)
    if key in _CACHE:
        return _CACHE[key]

    env = dict(os.environ)
    env["ENVIRONMENT"] = environment
    # The C4 guard refuses to boot on http:// or localhost origins under
    # production. That guard is not what is being tested here, so give each
    # environment origins it accepts and let the doc routes be the variable.
    env["ALLOWED_ORIGINS"] = (
        "https://lis.example.test" if environment == "production" else "http://localhost:5173"
    )
    if expose_docs is None:
        env.pop("EXPOSE_DOCS", None)
    else:
        env["EXPOSE_DOCS"] = expose_docs

    proc = subprocess.run(
        [sys.executable, "-c", _PROBE],
        cwd=_BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode == 0, (
        f"app failed to boot with ENVIRONMENT={environment} EXPOSE_DOCS={expose_docs!r}\n"
        f"--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
    )

    marker = "PROBE_RESULT:"
    line = next((ln for ln in proc.stdout.splitlines() if ln.startswith(marker)), None)
    assert line is not None, (
        f"probe produced no result line\n--- stdout ---\n{proc.stdout}\n"
        f"--- stderr ---\n{proc.stderr}"
    )

    _CACHE[key] = json.loads(line[len(marker):])
    return _CACHE[key]


class TestDocsClosedUnlessAskedFor:
    @pytest.mark.parametrize("environment", ["development", "production"])
    def test_every_doc_route_is_404_when_expose_docs_is_unset(self, environment):
        assert _boot(environment, None)["status"] == dict.fromkeys(_DOC_PATHS, 404)

    def test_a_lan_deployment_can_close_the_docs_without_touching_environment(self):
        """The regression that motivated splitting the flag.

        ENVIRONMENT=development is correct and deliberate on a plain-HTTP LAN.
        It must no longer drag the schema open with it.
        """
        assert _boot("development", None)["status"]["/openapi.json"] == 404

    @pytest.mark.parametrize("value", ["false", "1"])
    def test_anything_that_is_not_true_leaves_the_docs_closed(self, value):
        """Fail-closed on unrecognised values: only the literal "true" opens
        them, so a typo or a truthy-looking "1" cannot expose the schema."""
        assert _boot("development", value)["status"] == dict.fromkeys(_DOC_PATHS, 404)


class TestDocsOpenWhenAskedFor:
    @pytest.mark.parametrize("environment", ["development", "production"])
    def test_every_doc_route_is_served_when_expose_docs_is_true(self, environment):
        assert _boot(environment, "true")["status"] == dict.fromkeys(_DOC_PATHS, 200)

    def test_production_can_serve_the_docs_too(self):
        """The flag is not a re-spelling of "not production" — a staging box
        on HTTPS is entitled to its own schema."""
        assert _boot("production", "true")["status"]["/openapi.json"] == 200

    def test_the_value_is_matched_case_insensitively_and_trimmed(self):
        assert _boot("development", "  TRUE  ")["status"] == dict.fromkeys(_DOC_PATHS, 200)


class TestStartupWarning:
    def test_enabling_the_docs_logs_a_warning_naming_every_open_path(self):
        warnings = _boot("development", "true")["warnings"]
        assert len(warnings) == 1, warnings
        for path in _DOC_PATHS:
            assert path in warnings[0]

    def test_the_warning_is_also_logged_in_production(self):
        assert _boot("production", "true")["warnings"], "production boot logged no warning"

    @pytest.mark.parametrize("environment", ["development", "production"])
    def test_nothing_is_logged_when_the_docs_stay_closed(self, environment):
        assert _boot(environment, None)["warnings"] == []

    def test_enabling_the_docs_does_not_refuse_the_boot(self):
        """Unlike the C4 CORS guard, this warns and carries on — serving a
        schema on staging is a legitimate choice, so it must not be fatal."""
        assert _boot("production", "true")["status"]["/docs"] == 200
