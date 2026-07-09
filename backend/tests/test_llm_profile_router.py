"""Router-level tests for app/routers/llm_profile.py — CAN_MANAGE_SYSTEM_SETTINGS
(admin only) gates every route."""

from unittest.mock import AsyncMock, patch

import httpx

from app.crud.llm_profile import create
from app.schemas.llm_profile import LlmProfileCreate


def _profile_in(**overrides):
    fields = dict(display_name="Test Profile", provider="openai", model="gpt-4o")
    fields.update(overrides)
    return fields


class TestRbac:
    def test_admin_can_list(self, admin_client):
        assert admin_client.get("/llm-profiles").status_code == 200

    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get("/llm-profiles").status_code == 403

    def test_pathologist_cannot_create(self, pathologist_client):
        # CAN_MANAGE_SYSTEM_SETTINGS is admin-only, unlike CAN_MANAGE_SETTINGS
        r = pathologist_client.post("/llm-profiles", json=_profile_in())
        assert r.status_code == 403


class TestCrudWiring:
    def test_admin_can_create_update_delete(self, admin_client):
        created = admin_client.post("/llm-profiles", json=_profile_in()).json()
        assert created["display_name"] == "Test Profile"

        updated = admin_client.put(f"/llm-profiles/{created['id']}", json={"is_active": False})
        assert updated.status_code == 200
        assert updated.json()["is_active"] is False

        deleted = admin_client.delete(f"/llm-profiles/{created['id']}")
        assert deleted.status_code == 204

    def test_update_missing_returns_404(self, admin_client):
        r = admin_client.put("/llm-profiles/999999", json={"is_active": False})
        assert r.status_code == 404

    def test_delete_missing_returns_404(self, admin_client):
        assert admin_client.delete("/llm-profiles/999999").status_code == 404


class TestTestConnection:
    """Test-connection works off ad-hoc provider/model/base_url — no saved
    profile id needed, so it can be checked before a profile is even saved."""

    def _body(self, **overrides):
        fields = dict(provider="openai_compatible", model="gpt-4o-mini", base_url=None)
        fields.update(overrides)
        return fields

    def test_clinician_cannot_test(self, clinician_client):
        r = clinician_client.post("/llm-profiles/test-connection", json=self._body())
        assert r.status_code == 403

    def test_success_returns_detail(self, admin_client):
        with patch("app.routers.llm_profile.test_connection", new=AsyncMock(return_value="OK")):
            r = admin_client.post("/llm-profiles/test-connection", json=self._body())

        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_http_status_error_returns_502(self, admin_client):
        request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        response = httpx.Response(401, request=request, text="invalid api key")
        err = httpx.HTTPStatusError("401", request=request, response=response)
        with patch("app.routers.llm_profile.test_connection", new=AsyncMock(side_effect=err)):
            r = admin_client.post("/llm-profiles/test-connection", json=self._body())

        assert r.status_code == 502
        assert "401" in r.json()["detail"]

    def test_request_error_returns_502(self, admin_client):
        err = httpx.ConnectError("connection refused")
        with patch("app.routers.llm_profile.test_connection", new=AsyncMock(side_effect=err)):
            r = admin_client.post("/llm-profiles/test-connection", json=self._body())

        assert r.status_code == 502

    def test_malformed_provider_response_returns_502_not_500(self, admin_client):
        # Regression: a provider response missing the expected shape (e.g. a
        # reasoning model returning no content) must not crash as an
        # unhandled 500 — it should surface as a normal 502.
        err = ValueError("Provider returned no content (finish_reason='length')")
        with patch("app.routers.llm_profile.test_connection", new=AsyncMock(side_effect=err)):
            r = admin_client.post("/llm-profiles/test-connection", json=self._body())

        assert r.status_code == 502
        assert "no content" in r.json()["detail"]
