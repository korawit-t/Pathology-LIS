"""
Tests for the aggregated /unified-cases endpoint & get_unified_cases crud
(app/crud/unified_case.py) — the server-side replacement for the "All" tab's
client-side buildUnifiedRows merge, which silently capped each case type at
20 records with no way to page to the rest.
"""

import uuid
from datetime import datetime, timedelta

from app.crud.molecular_case import (
    cancel_molecular_case,
    create_standalone_molecular_case,
)
from app.crud.surgical_block_stain import create_stain
from app.crud.unified_case import get_unified_cases
from app.schemas.molecular_case import MolecularCaseCreate
from app.schemas.surgical_block_stain import StainCreate

from tests.factories import (
    make_anatomical_pathology_test,
    make_bare_case,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_block,
    make_hospital,
    make_patient,
    make_signable_case,
)


class TestUnifiedCasesCrud:
    def test_merges_all_three_case_types(self, db, admin_user):
        registrar, _ = admin_user
        marker = uuid.uuid4().hex[:10]
        base = datetime(2026, 1, 1, 12, 0, 0)

        surg = make_bare_case(db, registrar_id=registrar.id)
        surg.hn = marker
        surg.registered_at = base
        gyne = make_bare_gyne_case(db, registrar_id=registrar.id)
        gyne.hn = marker
        gyne.registered_at = base + timedelta(minutes=1)
        ng = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ng.hn = marker
        ng.registered_at = base + timedelta(minutes=2)
        db.commit()

        result = get_unified_cases(db, search=marker, limit=20)

        assert result["total"] == 3
        case_types = {row["case_type"] for row in result["items"]}
        assert case_types == {"surgical", "gyne", "nongyne"}
        # descending by registered_at: nongyne, gyne, surgical
        assert [row["case_type"] for row in result["items"]] == ["nongyne", "gyne", "surgical"]
        assert result["items"][0]["id"] == ng.id
        assert result["items"][0]["accession_no"] == ng.accession_no

    def test_pagination_does_not_drop_or_duplicate_rows_across_page_boundary(self, db, admin_user):
        """Regression test for the bug this endpoint exists to fix: a page
        beyond the first must not go missing or overlap once total > limit."""
        registrar, _ = admin_user
        marker = uuid.uuid4().hex[:10]
        cases = []
        for i in range(25):
            case = make_bare_gyne_case(db, registrar_id=registrar.id)
            case.hn = marker
            case.registered_at = datetime(2026, 1, 1) + timedelta(minutes=i)
            cases.append(case)
        db.commit()

        page1 = get_unified_cases(db, search=marker, skip=0, limit=20)
        page2 = get_unified_cases(db, search=marker, skip=20, limit=20)

        assert page1["total"] == 25
        assert page2["total"] == 25
        assert len(page1["items"]) == 20
        assert len(page2["items"]) == 5

        page1_ids = {row["id"] for row in page1["items"]}
        page2_ids = {row["id"] for row in page2["items"]}
        assert page1_ids.isdisjoint(page2_ids)
        assert page1_ids | page2_ids == {c.id for c in cases}

    def test_search_narrows_results(self, db, admin_user):
        registrar, _ = admin_user
        result = get_unified_cases(db, search="no-such-case-xyz-999")
        assert result["total"] == 0
        assert result["items"] == []

    def test_case_type_filter_restricts_to_one_domain(self, db, admin_user):
        registrar, _ = admin_user
        marker = uuid.uuid4().hex[:10]
        surg = make_bare_case(db, registrar_id=registrar.id)
        surg.hn = marker
        gyne = make_bare_gyne_case(db, registrar_id=registrar.id)
        gyne.hn = marker
        db.commit()

        result = get_unified_cases(db, search=marker, case_types=["surgical"])

        assert result["total"] == 1
        assert result["items"][0]["case_type"] == "surgical"
        assert result["items"][0]["id"] == surg.id

    def test_merges_molecular_standalone_case(self, db, admin_user):
        registrar, _ = admin_user
        marker = uuid.uuid4().hex[:10]
        patient = make_patient(db, name=f"UnifiedMolecular{marker}")
        hospital = make_hospital(db)
        ap_test = make_anatomical_pathology_test(db, category="Molecular", system_code=None, name="EGFR Unified Test")

        case = create_standalone_molecular_case(
            db,
            MolecularCaseCreate(patient_id=patient.id, ap_test_id=ap_test.id, hospital_id=hospital.id, hn=marker),
            registrar_id=registrar.id,
        )

        result = get_unified_cases(db, search=marker)
        assert result["total"] == 1
        row = result["items"][0]
        assert row["case_type"] == "molecular"
        assert row["id"] == case.id
        assert row["hn"] == marker
        assert row["hospital_name"] == hospital.name
        assert patient.name in (row["patient_name"] or "")
        assert row["specimen"] == "EGFR Unified Test"

    def test_merges_molecular_parent_linked_case_resolves_via_parent(self, db, admin_user):
        registrar, _ = admin_user
        marker = uuid.uuid4().hex[:10]
        surg_case, specimen = make_signable_case(db, registrar_id=registrar.id)
        surg_case.hn = marker
        db.commit()
        block = make_block(db, specimen.id)
        ap_test = make_anatomical_pathology_test(db, category="Molecular", system_code=None, name="KRAS Unified Test")

        create_stain(db, StainCreate(block_id=block.id, test_id=ap_test.id, slide_no=1), registrar_id=registrar.id)

        result = get_unified_cases(db, search=marker)
        case_types = {row["case_type"] for row in result["items"]}
        assert "surgical" in case_types
        assert "molecular" in case_types

        molecular_row = next(r for r in result["items"] if r["case_type"] == "molecular")
        # hn/patient resolve through the parent Surgical case, but the
        # accession is the Molecular case's own (M26-...), not the parent's.
        assert molecular_row["hn"] == marker
        assert molecular_row["accession_no"] != surg_case.accession_no
        assert molecular_row["accession_no"].startswith("M")

    def test_molecular_cancelled_case_reports_cancelled_status(self, db, admin_user):
        registrar, _ = admin_user
        marker = uuid.uuid4().hex[:10]
        patient = make_patient(db, name=f"CancelUnified{marker}")
        ap_test = make_anatomical_pathology_test(db, category="Molecular", system_code=None, name="BRAF Unified Test")
        case = create_standalone_molecular_case(
            db,
            MolecularCaseCreate(patient_id=patient.id, ap_test_id=ap_test.id, hn=marker),
            registrar_id=registrar.id,
        )
        cancel_molecular_case(db, case.id, reason="test cancel", cancelled_by_id=registrar.id)

        result = get_unified_cases(db, search=marker)
        assert result["items"][0]["status"] == "cancelled"

    def test_case_type_filter_can_restrict_to_molecular(self, db, admin_user):
        registrar, _ = admin_user
        marker = uuid.uuid4().hex[:10]
        surg = make_bare_case(db, registrar_id=registrar.id)
        surg.hn = marker
        db.commit()
        patient = make_patient(db, name=f"FilterMolecular{marker}")
        ap_test = make_anatomical_pathology_test(db, category="Molecular", system_code=None, name="ALK Unified Test")
        molecular_case = create_standalone_molecular_case(
            db,
            MolecularCaseCreate(patient_id=patient.id, ap_test_id=ap_test.id, hn=marker),
            registrar_id=registrar.id,
        )

        result = get_unified_cases(db, search=marker, case_types=["molecular"])

        assert result["total"] == 1
        assert result["items"][0]["case_type"] == "molecular"
        assert result["items"][0]["id"] == molecular_case.id


class TestUnifiedCasesRouterAccess:
    def test_unauthenticated_list_returns_401(self, client):
        r = client.get("/unified-cases")
        assert r.status_code == 401

    def test_admin_can_list_cases(self, admin_client):
        r = admin_client.get("/unified-cases")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert isinstance(body["items"], list)

    def test_list_supports_pagination_params(self, admin_client):
        r = admin_client.get("/unified-cases", params={"skip": 0, "limit": 5})
        assert r.status_code == 200

    def test_list_supports_search_param(self, admin_client):
        r = admin_client.get("/unified-cases", params={"search": "no-such-case-xyz-999"})
        assert r.status_code == 200
        assert r.json()["total"] == 0
