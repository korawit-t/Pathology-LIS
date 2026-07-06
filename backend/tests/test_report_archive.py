"""Tests for app/crud/report_archive.py — the raw-SQL current+legacy UNION
archive queries. Search/clinician/hospital values are always bound via
:named params (verified in the source), only structural WHERE fragments are
f-string built, so these tests focus on correctness of that composition:
search matching, filters, pagination, and the current+legacy union."""

import uuid

from app.crud.report_archive import get_surgical_archive, get_gyne_archive, get_nongyne_archive
from app.models.legacy_surgical_report import LegacySurgicalReport
from app.models.legacy_gyne_cyto_report import LegacyGyneCytoReport
from app.models.legacy_nongyne_cyto_report import LegacyNongyneCytoReport

from tests.factories import make_signable_case, make_bare_gyne_case, make_bare_nongyne_case, make_hospital


class TestSurgicalArchive:
    def test_current_case_with_no_report_shows_in_progress(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        result = get_surgical_archive(db, search=case.accession_no)

        assert result["total"] == 1
        row = result["items"][0]
        assert row["source"] == "current"
        assert row["status"] == "in_progress"

    def test_search_matches_patient_name(self, db, admin_user):
        registrar, _ = admin_user
        from tests.factories import make_patient
        patient = make_patient(db, name=f"Uniquename{uuid.uuid4().hex[:8]}")
        case, specimen = make_signable_case(db, registrar_id=registrar.id, patient=patient)

        result = get_surgical_archive(db, search=patient.name)

        assert any(r["id"] == case.id for r in result["items"])

    def test_hospital_filter_scopes_results(self, db, admin_user):
        registrar, _ = admin_user
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_a, _ = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_a)
        case_b, _ = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_b)

        result = get_surgical_archive(db, hospital_ids=[hosp_a.id], search=case_a.accession_no)
        assert any(r["id"] == case_a.id for r in result["items"])

        result_b_search_for_a = get_surgical_archive(db, hospital_ids=[hosp_b.id], search=case_a.accession_no)
        assert not any(r["id"] == case_a.id for r in result_b_search_for_a["items"])

    def test_legacy_report_included_with_legacy_source(self, db):
        acc = f"S-LEGACY-{uuid.uuid4().hex[:8]}"
        legacy = LegacySurgicalReport(accession_no=acc, patient_name="Legacy Patient", status="published")
        db.add(legacy)
        db.commit()

        result = get_surgical_archive(db, search=acc)

        assert result["total"] == 1
        assert result["items"][0]["source"] == "legacy"
        assert result["items"][0]["accession_no"] == acc

    def test_pagination_limits_items(self, db, admin_user):
        registrar, _ = admin_user
        for _ in range(3):
            make_signable_case(db, registrar_id=registrar.id)

        page1 = get_surgical_archive(db, page=1, size=1)
        assert len(page1["items"]) == 1
        assert page1["total"] >= 3


class TestGyneArchive:
    def test_current_case_shows_up(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        result = get_gyne_archive(db, search=case.accession_no)

        assert result["total"] == 1
        assert result["items"][0]["source"] == "current"

    def test_legacy_gyne_report_included(self, db):
        acc = f"C-LEGACY-{uuid.uuid4().hex[:8]}"
        db.add(LegacyGyneCytoReport(accession_no=acc, patient_name="Legacy Gyne", status="published"))
        db.commit()

        result = get_gyne_archive(db, search=acc)
        assert result["total"] == 1
        assert result["items"][0]["source"] == "legacy"


class TestNongyneArchive:
    def test_current_case_shows_up(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        result = get_nongyne_archive(db, search=case.accession_no)

        assert result["total"] == 1
        assert result["items"][0]["source"] == "current"

    def test_legacy_nongyne_report_included(self, db):
        acc = f"N-LEGACY-{uuid.uuid4().hex[:8]}"
        db.add(LegacyNongyneCytoReport(accession_no=acc, patient_name="Legacy NonGyne", status="published"))
        db.commit()

        result = get_nongyne_archive(db, search=acc)
        assert result["total"] == 1
        assert result["items"][0]["source"] == "legacy"
