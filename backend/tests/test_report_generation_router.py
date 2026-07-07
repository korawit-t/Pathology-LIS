"""Router-level tests for app/routers/report_generation.py (AI-assisted
surgical report drafting). No crud module exists for this domain — logic
lives entirely in the router — so this gives fuller coverage: the
_resolve_profile_and_settings guard chain (no profile configured / inactive
profile / missing case / no specimens), and the individual-vs-combined
message building via a mocked call_llm (real LLM calls aren't exercised
here, same as test_tumor_registry_router.py's approach)."""

from unittest.mock import patch

from app.crud.llm_profile import create as create_llm_profile
from app.schemas.llm_profile import LlmProfileCreate
from app.crud.system_setting import update_settings
from app.schemas.system_setting import SystemSettingUpdate

from tests.factories import make_signable_case


def _active_profile(db):
    return create_llm_profile(db, LlmProfileCreate(display_name="Test Profile", provider="openai", model="gpt-4o"))


class TestRbac:
    def test_clinician_cannot_preview(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)

        r = clinician_client.post(
            f"/surgical-cases/{case.id}/generate-report-preview",
            json={"source": "gross_and_micro", "diagnosis_mode": "individual"},
        )

        assert r.status_code == 403

    def test_requires_authentication(self, client):
        r = client.post("/surgical-cases/1/generate-report-preview", json={"source": "gross_and_micro", "diagnosis_mode": "individual"})
        assert r.status_code == 401


class TestResolveProfileGuardChain:
    def test_no_profile_configured_returns_400(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)

        r = pathologist_client.post(
            f"/surgical-cases/{case.id}/generate-report-preview",
            json={"source": "gross_and_micro", "diagnosis_mode": "individual"},
        )

        assert r.status_code == 400

    def test_inactive_profile_returns_400(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        profile = _active_profile(db)
        profile.is_active = False
        db.commit()
        update_settings(db, SystemSettingUpdate(report_gen_llm_profile_id=profile.id))

        r = pathologist_client.post(
            f"/surgical-cases/{case.id}/generate-report-preview",
            json={"source": "gross_and_micro", "diagnosis_mode": "individual"},
        )

        assert r.status_code == 400

    def test_missing_case_returns_404(self, db, pathologist_client):
        profile = _active_profile(db)
        update_settings(db, SystemSettingUpdate(report_gen_llm_profile_id=profile.id))

        r = pathologist_client.post(
            "/surgical-cases/999999/generate-report-preview",
            json={"source": "gross_and_micro", "diagnosis_mode": "individual"},
        )

        assert r.status_code == 404


class TestPreviewMessageBuilding:
    def test_preview_includes_gross_and_clinical_context(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.clinical_diagnosis = "Suspicious mass"
        specimen.gross_description = "A 2cm firm nodule"
        db.commit()
        profile = _active_profile(db)
        update_settings(db, SystemSettingUpdate(report_gen_llm_profile_id=profile.id))

        r = pathologist_client.post(
            f"/surgical-cases/{case.id}/generate-report-preview",
            json={"source": "gross_and_micro", "diagnosis_mode": "individual"},
        )

        assert r.status_code == 200
        assert "Suspicious mass" in r.json()["user_message"]
        assert "A 2cm firm nodule" in r.json()["user_message"]

    def test_micro_only_omits_gross_section(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.gross_description = "Should not appear"
        db.commit()
        profile = _active_profile(db)
        update_settings(db, SystemSettingUpdate(report_gen_llm_profile_id=profile.id))

        r = pathologist_client.post(
            f"/surgical-cases/{case.id}/generate-report-preview",
            json={"source": "micro_only", "diagnosis_mode": "individual"},
        )

        assert r.status_code == 200
        assert "Should not appear" not in r.json()["user_message"]


class TestGenerateReportWithMockedLlm:
    def test_no_gross_description_returns_422(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        profile = _active_profile(db)
        update_settings(db, SystemSettingUpdate(report_gen_llm_profile_id=profile.id))

        r = pathologist_client.post(
            f"/surgical-cases/{case.id}/generate-report",
            json={"source": "gross_and_micro", "diagnosis_mode": "individual"},
        )

        assert r.status_code == 422

    def test_individual_mode_maps_results_back_to_specimens(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.gross_description = "A firm nodule"
        db.commit()
        profile = _active_profile(db)
        update_settings(db, SystemSettingUpdate(report_gen_llm_profile_id=profile.id))
        llm_response = (
            '{"results": [{"specimen_id": %d, "microscopic_description": "Bland cells", "diagnosis": "Benign"}]}'
            % specimen.id
        )

        with patch("app.routers.report_generation.call_llm", return_value=llm_response):
            r = pathologist_client.post(
                f"/surgical-cases/{case.id}/generate-report",
                json={"source": "gross_and_micro", "diagnosis_mode": "individual"},
            )

        assert r.status_code == 200
        body = r.json()
        assert body["mode"] == "individual"
        assert body["specimens"][0]["diagnosis"] == "Benign"

    def test_invalid_llm_json_returns_502(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.gross_description = "A firm nodule"
        db.commit()
        profile = _active_profile(db)
        update_settings(db, SystemSettingUpdate(report_gen_llm_profile_id=profile.id))

        with patch("app.routers.report_generation.call_llm", return_value="not json"):
            r = pathologist_client.post(
                f"/surgical-cases/{case.id}/generate-report",
                json={"source": "gross_and_micro", "diagnosis_mode": "individual"},
            )

        assert r.status_code == 502
