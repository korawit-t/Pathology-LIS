"""Router-level tests for app/routers/grossing_assist.py (AI-assisted
completeness/QC check over every specimen's gross description). Mirrors
test_tumor_registry_router.py's approach: the feature-flag guard
(_require_enabled), the specimens-text builder, and the two LLM-touching
endpoints with call_llm mocked (no real external calls in tests)."""

from unittest.mock import patch

from app.crud.llm_profile import create as create_llm_profile
from app.schemas.llm_profile import LlmProfileCreate

from tests.factories import make_system_setting, make_signable_case


def _active_profile(db):
    return create_llm_profile(db, LlmProfileCreate(display_name="Test Profile", provider="openai", model="gpt-4o"))


class TestRequiresEnabled:
    def test_disabled_returns_403(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db, grossing_assist_enabled=False)

        r = pathologist_client.get(f"/surgical-cases/{case.id}/grossing-assist-preview")

        assert r.status_code == 403

    def test_no_settings_row_at_all_returns_403(self, db, pathologist_client, admin_user):
        from tests.factories import clear_system_settings
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        clear_system_settings(db)

        r = pathologist_client.get(f"/surgical-cases/{case.id}/grossing-assist-preview")

        assert r.status_code == 403


class TestRbac:
    def test_clinician_cannot_access(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db, grossing_assist_enabled=True)

        r = clinician_client.get(f"/surgical-cases/{case.id}/grossing-assist-preview")

        assert r.status_code == 403

    def test_requires_authentication(self, client):
        r = client.get("/surgical-cases/1/grossing-assist-preview")
        assert r.status_code == 401


class TestProfileGuardChain:
    def test_no_profile_configured_returns_400(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db, grossing_assist_enabled=True, grossing_assist_llm_profile_id=None)

        r = pathologist_client.get(f"/surgical-cases/{case.id}/grossing-assist-preview")

        assert r.status_code == 400

    def test_inactive_profile_returns_400(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        profile = _active_profile(db)
        profile.is_active = False
        db.commit()
        make_system_setting(db, grossing_assist_enabled=True, grossing_assist_llm_profile_id=profile.id)

        r = pathologist_client.get(f"/surgical-cases/{case.id}/grossing-assist-preview")

        assert r.status_code == 400


class TestPreview:
    def test_preview_includes_gross_text_per_specimen(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.gross_description = "A 2cm firm nodule"
        db.commit()
        profile = _active_profile(db)
        make_system_setting(db, grossing_assist_enabled=True, grossing_assist_llm_profile_id=profile.id)

        r = pathologist_client.get(f"/surgical-cases/{case.id}/grossing-assist-preview")

        assert r.status_code == 200
        body = r.json()
        assert body["profile_name"] == "Test Profile"
        assert "A 2cm firm nodule" in body["specimens_text"]
        assert f"Specimen {specimen.specimen_label}" in body["specimens_text"]

    def test_preview_with_no_gross_text_returns_null_specimens_text(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        profile = _active_profile(db)
        make_system_setting(db, grossing_assist_enabled=True, grossing_assist_llm_profile_id=profile.id)

        r = pathologist_client.get(f"/surgical-cases/{case.id}/grossing-assist-preview")

        assert r.status_code == 200
        assert r.json()["specimens_text"] is None


class TestRunWithMockedLlm:
    def test_no_gross_description_returns_422(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        profile = _active_profile(db)
        make_system_setting(db, grossing_assist_enabled=True, grossing_assist_llm_profile_id=profile.id)

        r = pathologist_client.post(f"/surgical-cases/{case.id}/grossing-assist")

        assert r.status_code == 422

    def test_success_returns_feedback(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.gross_description = "A firm nodule, no measurements given"
        db.commit()
        profile = _active_profile(db)
        make_system_setting(db, grossing_assist_enabled=True, grossing_assist_llm_profile_id=profile.id)
        llm_response = '{"feedback": "Specimen A: missing dimensions"}'

        with patch("app.routers.grossing_assist.call_llm", return_value=llm_response):
            r = pathologist_client.post(f"/surgical-cases/{case.id}/grossing-assist")

        assert r.status_code == 200
        assert r.json()["feedback"] == "Specimen A: missing dimensions"

    def test_invalid_llm_json_returns_502(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.gross_description = "A firm nodule"
        db.commit()
        profile = _active_profile(db)
        make_system_setting(db, grossing_assist_enabled=True, grossing_assist_llm_profile_id=profile.id)

        with patch("app.routers.grossing_assist.call_llm", return_value="not json"):
            r = pathologist_client.post(f"/surgical-cases/{case.id}/grossing-assist")

        assert r.status_code == 502
