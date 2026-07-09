"""Router-level tests for app/routers/tumor_registry.py. Real logic worth
covering here (none of it lives in the crud layer): the feature-flag guard
(_require_enabled), _get_diagnosis_text's case-level-preferred /
specimen-level-fallback + HTML-stripping, and the AI-suggest endpoints
(mocked call_llm, same asyncio-free approach as the other LLM-touching
tests)."""

from unittest.mock import patch

from app.crud.llm_profile import create as create_llm_profile
from app.schemas.llm_profile import LlmProfileCreate
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.enums.surgical_diagnosis_enums import DiagnosisLevel

from tests.factories import make_system_setting, make_signable_case


class TestRequiresEnabled:
    def test_disabled_registry_returns_403(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case = make_signable_case(db, registrar_id=registrar.id)[0]
        make_system_setting(db, tumor_registry_enabled=False)

        r = admin_client.get(f"/tumor-registries/{case.id}")

        assert r.status_code == 403

    def test_no_settings_row_at_all_returns_403(self, db, admin_client, admin_user):
        from tests.factories import clear_system_settings
        registrar, _ = admin_user
        case = make_signable_case(db, registrar_id=registrar.id)[0]
        clear_system_settings(db)

        r = admin_client.get(f"/tumor-registries/{case.id}")

        assert r.status_code == 403


class TestGetAndUpsert:
    def test_pathologist_can_upsert_and_read_back(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_signable_case(db, registrar_id=registrar.id)[0]
        make_system_setting(db, tumor_registry_enabled=True)

        r = pathologist_client.put(f"/tumor-registries/{case.id}", json={"grade": "G2", "pt": "T2"})
        assert r.status_code == 200
        assert r.json()["grade"] == "G2"

        r2 = pathologist_client.get(f"/tumor-registries/{case.id}")
        assert r2.status_code == 200
        assert r2.json()["pt"] == "T2"

    def test_clinician_cannot_upsert(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case = make_signable_case(db, registrar_id=registrar.id)[0]
        make_system_setting(db, tumor_registry_enabled=True)

        r = clinician_client.put(f"/tumor-registries/{case.id}", json={"grade": "G2"})

        assert r.status_code == 403

    def test_clinician_can_read(self, db, clinician_client, admin_user):
        # CAN_READ_REPORT is much broader than CAN_WRITE_REPORT — includes clinician
        registrar, _ = admin_user
        case = make_signable_case(db, registrar_id=registrar.id)[0]
        make_system_setting(db, tumor_registry_enabled=True)

        r = clinician_client.get(f"/tumor-registries/{case.id}")

        assert r.status_code == 404  # enabled, readable, just nothing registered yet


class TestGetSummary:
    def test_computes_coverage_percentage_and_breakdowns(self, db, admin_client, admin_user):
        # /summary has no date filter in this call, so its counts span every
        # case/registry ever committed in this run, not just this test's own
        # — assert on the delta this test itself introduces (2 new malignant
        # cases, 1 newly registered), and use a uuid-unique topography/grade
        # so the breakdown lookup can't collide with another test's values.
        import uuid
        from app.crud.tumor_registry import upsert
        from app.schemas.tumor_registry import TumorRegistryUpsert

        registrar, _ = admin_user
        make_system_setting(db, tumor_registry_enabled=True)
        baseline = admin_client.get("/tumor-registries/summary").json()

        case1 = make_signable_case(db, registrar_id=registrar.id)[0]
        case1.has_malignancy = True
        case2 = make_signable_case(db, registrar_id=registrar.id)[0]
        case2.has_malignancy = True
        db.commit()
        topo_code = f"C{uuid.uuid4().hex[:6]}"
        grade = f"G{uuid.uuid4().hex[:6]}"
        upsert(db, case1.id, TumorRegistryUpsert(topography_code=topo_code, topography_desc="Breast", grade=grade, pt="T2"), user_id=registrar.id)

        r = admin_client.get("/tumor-registries/summary")

        assert r.status_code == 200
        body = r.json()
        assert body["malignant_total"] == baseline["malignant_total"] + 2
        assert body["total_registered"] == baseline["total_registered"] + 1
        assert {"code": topo_code, "desc": "Breast", "count": 1} in body["by_topography"]
        assert {"grade": grade, "count": 1} in body["by_grade"]


class TestSuggestIcdO:
    def test_no_ai_profile_configured_returns_400(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case = make_signable_case(db, registrar_id=registrar.id)[0]
        make_system_setting(db, tumor_registry_enabled=True, tumor_registry_llm_profile_id=None)

        r = admin_client.get(f"/tumor-registries/{case.id}/suggest-preview")

        assert r.status_code == 400

    def test_preview_includes_the_case_level_diagnosis_text_stripped_of_html(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        profile = create_llm_profile(db, LlmProfileCreate(display_name="Test", provider="openai", model="gpt-4o"))
        make_system_setting(db, tumor_registry_enabled=True, tumor_registry_llm_profile_id=profile.id)
        db.add(SurgicalDiagnosis(
            case_id=case.id, diagnosis_level=DiagnosisLevel.CASE,
            diagnosis="<p>Invasive <b>ductal</b> carcinoma</p>", status="finalized",
        ))
        db.commit()

        r = admin_client.get(f"/tumor-registries/{case.id}/suggest-preview")

        assert r.status_code == 200
        assert r.json()["diagnosis_text"] == "Invasive ductal carcinoma"

    def test_falls_back_to_specimen_level_diagnoses_when_no_case_level_exists(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        profile = create_llm_profile(db, LlmProfileCreate(display_name="Test", provider="openai", model="gpt-4o"))
        make_system_setting(db, tumor_registry_enabled=True, tumor_registry_llm_profile_id=profile.id)
        db.add(SurgicalDiagnosis(
            case_id=case.id, diagnosis_level=DiagnosisLevel.SPECIMEN, surgical_specimen_id=specimen.id,
            diagnosis="Adenocarcinoma", status="finalized",
        ))
        db.commit()

        r = admin_client.get(f"/tumor-registries/{case.id}/suggest-preview")

        assert r.status_code == 200
        assert f"Specimen {specimen.specimen_label}: Adenocarcinoma" in r.json()["diagnosis_text"]

    def test_suggest_calls_the_configured_llm_and_returns_parsed_fields(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        profile = create_llm_profile(db, LlmProfileCreate(display_name="Test", provider="openai", model="gpt-4o"))
        make_system_setting(db, tumor_registry_enabled=True, tumor_registry_llm_profile_id=profile.id)
        db.add(SurgicalDiagnosis(case_id=case.id, diagnosis_level=DiagnosisLevel.CASE, diagnosis="Carcinoma", status="finalized"))
        db.commit()

        fake_llm_json = '{"topography_code": "C50", "topography_desc": "Breast", "morphology_code": "8500/3", "morphology_desc": "Ductal"}'
        with patch("app.routers.tumor_registry.call_llm", return_value=fake_llm_json) as mock_call:
            r = admin_client.post(f"/tumor-registries/{case.id}/suggest")

        assert r.status_code == 200
        assert r.json()["topography_code"] == "C50"
        mock_call.assert_called_once()

    def test_list_wrapped_llm_response_is_handled_not_500(self, db, admin_client, admin_user):
        # Regression: Gemini (via openai_compatible) doesn't strictly
        # enforce a top-level JSON object even in json-mode, and can
        # wrap the object in a list — previously crashed with an
        # unhandled AttributeError ('list' object has no attribute 'get')
        # instead of a clean error response.
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        profile = create_llm_profile(db, LlmProfileCreate(display_name="Test", provider="openai", model="gpt-4o"))
        make_system_setting(db, tumor_registry_enabled=True, tumor_registry_llm_profile_id=profile.id)
        db.add(SurgicalDiagnosis(case_id=case.id, diagnosis_level=DiagnosisLevel.CASE, diagnosis="Carcinoma", status="finalized"))
        db.commit()

        fake_llm_json = '[{"topography_code": "C50", "topography_desc": "Breast", "morphology_code": "8500/3", "morphology_desc": "Ductal"}]'
        with patch("app.routers.tumor_registry.call_llm", return_value=fake_llm_json):
            r = admin_client.post(f"/tumor-registries/{case.id}/suggest")

        assert r.status_code == 200
        assert r.json()["topography_code"] == "C50"

    def test_no_diagnosis_text_returns_422(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case = make_signable_case(db, registrar_id=registrar.id)[0]
        profile = create_llm_profile(db, LlmProfileCreate(display_name="Test", provider="openai", model="gpt-4o"))
        make_system_setting(db, tumor_registry_enabled=True, tumor_registry_llm_profile_id=profile.id)

        r = admin_client.post(f"/tumor-registries/{case.id}/suggest")

        assert r.status_code == 422

    def test_llm_error_becomes_502(self, db, admin_client, admin_user):
        registrar, _ = admin_user
        case = make_signable_case(db, registrar_id=registrar.id)[0]
        profile = create_llm_profile(db, LlmProfileCreate(display_name="Test", provider="openai", model="gpt-4o"))
        make_system_setting(db, tumor_registry_enabled=True, tumor_registry_llm_profile_id=profile.id)
        db.add(SurgicalDiagnosis(case_id=case.id, diagnosis_level=DiagnosisLevel.CASE, diagnosis="Carcinoma", status="finalized"))
        db.commit()

        with patch("app.routers.tumor_registry.call_llm", side_effect=RuntimeError("timeout")):
            r = admin_client.post(f"/tumor-registries/{case.id}/suggest")

        assert r.status_code == 502
