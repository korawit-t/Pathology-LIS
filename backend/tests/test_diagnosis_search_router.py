"""Router-level tests for app/routers/diagnosis_search.py. The matching logic
has full coverage in test_diagnosis_search.py — this is auth, the role gate,
and query-param wiring only."""

import uuid

from app.enums.surgical_diagnosis_enums import DiagnosisLevel
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_specimen import SurgicalSpecimen
from app.utils.time import local_now

from tests.factories import make_bare_case


def _reported_case(db, registrar_id, tag):
    case = make_bare_case(db, registrar_id=registrar_id)
    case.is_reported = True
    case.report_at = local_now()
    db.add(
        SurgicalSpecimen(
            case_id=case.id, specimen_label="A", specimen_name=f"Colon{tag}, biopsy{tag}"
        )
    )
    db.add(
        SurgicalDiagnosis(
            case_id=case.id,
            diagnosis_level=DiagnosisLevel.CASE,
            diagnosis=f"Adenocarcinoma{tag}",
            diagnosis_order=1,
            status="signed",
        )
    )
    db.commit()
    db.refresh(case)
    return case


class TestRbacAndAuth:
    def test_requires_authentication(self, client):
        r = client.get("/diagnosis-search", params={"specimen_terms": ["colon"]})
        assert r.status_code == 401

    def test_pathologist_is_allowed(self, pathologist_client):
        r = pathologist_client.get(
            "/diagnosis-search", params={"specimen_terms": ["colon"]}
        )
        assert r.status_code == 200

    def test_lab_manager_is_allowed(self, lab_manager_client):
        r = lab_manager_client.get(
            "/diagnosis-search", params={"specimen_terms": ["colon"]}
        )
        assert r.status_code == 200

    def test_clinician_is_rejected(self, clinician_client):
        r = clinician_client.get(
            "/diagnosis-search", params={"specimen_terms": ["colon"]}
        )
        assert r.status_code == 403


class TestValidation:
    def test_rejects_a_query_with_no_terms(self, pathologist_client):
        r = pathologist_client.get("/diagnosis-search")
        assert r.status_code == 400

    def test_rejects_a_query_whose_terms_are_all_blank(self, pathologist_client):
        r = pathologist_client.get(
            "/diagnosis-search", params={"specimen_terms": ["   ", ""]}
        )
        assert r.status_code == 400

    def test_rejects_an_unknown_match_mode(self, pathologist_client):
        r = pathologist_client.get(
            "/diagnosis-search",
            params={"specimen_terms": ["colon"], "match_mode": "sometimes"},
        )
        assert r.status_code == 422

    def test_rejects_an_unknown_date_field(self, pathologist_client):
        r = pathologist_client.get(
            "/diagnosis-search",
            params={"specimen_terms": ["colon"], "date_field": "collected"},
        )
        assert r.status_code == 422


class TestResponseWiring:
    def test_returns_the_matching_case_and_echoes_the_criteria(
        self, pathologist_client, db, admin_user
    ):
        registrar, _ = admin_user
        tag = uuid.uuid4().hex[:10]
        case = _reported_case(db, registrar.id, tag)

        r = pathologist_client.get(
            "/diagnosis-search",
            params={
                "specimen_terms": [f"colon{tag}", f"biopsy{tag}"],
                "diagnosis_terms": [f"adenocarcinoma{tag}"],
            },
        )
        body = r.json()

        assert r.status_code == 200
        assert body["total"] == 1
        assert body["items"][0]["accession_no"] == case.accession_no
        assert body["items"][0]["matched_specimens"] == [f"A: Colon{tag}, biopsy{tag}"]
        assert body["criteria"]["specimen_terms"] == [f"colon{tag}", f"biopsy{tag}"]
        assert body["criteria"]["match_mode"] == "all"
        assert body["criteria"]["date_field"] == "registered"

    def test_limit_caps_items_but_not_total(self, pathologist_client, db, admin_user):
        registrar, _ = admin_user
        tag = uuid.uuid4().hex[:10]
        for _ in range(2):
            _reported_case(db, registrar.id, tag)

        r = pathologist_client.get(
            "/diagnosis-search",
            params={"specimen_terms": [f"colon{tag}"], "limit": 1},
        )
        body = r.json()

        assert body["total"] == 2
        assert len(body["items"]) == 1
