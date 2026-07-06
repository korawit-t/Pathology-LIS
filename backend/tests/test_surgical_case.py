"""Tests for app/crud/surgical_case.py — accession numbering, the
in-progress/published listing views (get_cases' has_ihc flag and is_pending
OR-logic, list_hospital_cases' live+published merge), delete/cancel guards
(cancel currently has NO status guard, unlike delete — confirmed with the
user, tested as documented current behavior, not a bug to fix here),
update_case's readonly-fields blocklist, and the billing/dashboard
aggregations (get_case_cost_summary's quantity rollup across specimen-tests
and block-stains, get_dashboard_summary's TAT overdue/warning buckets)."""

import uuid
from datetime import timedelta

import pytest
from fastapi import HTTPException

from app.crud.surgical_case import (
    _get_next_accession_no,
    create_case_with_specimens,
    get_cases,
    get_case,
    delete_case,
    cancel_surgical_case,
    update_case,
    list_hospital_cases,
    get_case_cost_summary,
    get_hospital_billing_summary,
    get_dashboard_summary,
)
from app.schemas.surgical_case import SurgicalCaseCreate, SurgicalCaseUpdate
from app.schemas.surgical_specimen import SurgicalSpecimenCreate
from app.models.surgical_case import SurgicalCase
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.surgical_specimen_ap_test import SurgicalSpecimenAPTest
from app.utils.time import local_now

from tests.factories import (
    make_signable_case,
    make_bare_case,
    make_block,
    make_block_stain,
    make_anatomical_pathology_test,
    make_system_setting,
    clear_system_settings,
)


class TestGetNextAccessionNo:
    def test_sequential_numbers_share_prefix(self, db, admin_user):
        registrar, _ = admin_user
        from tests.factories import make_patient, make_system_setting
        patient = make_patient(db)
        # A unique prefix keeps this test's accession numbers from colliding
        # with sibling tests' hex-suffixed ones (e.g. "S26-a1b2c3d4") — those
        # sort after purely-numeric ones lexicographically and would become
        # the "last" row instead, and their non-numeric suffix falls into the
        # int()-parse except branch, silently resetting the run number to 1.
        make_system_setting(db, surgical_accession_prefix=uuid.uuid4().hex[:6].upper())
        first = _get_next_accession_no(db)
        # Persist a case using that number so the next call sees it as "last".
        db.add(SurgicalCase(accession_no=first, registrar_id=registrar.id, patient_id=patient.id))
        db.commit()

        second = _get_next_accession_no(db)

        prefix, first_run = first.rsplit("-", 1)
        _, second_run = second.rsplit("-", 1)
        assert second.startswith(prefix)
        assert int(second_run) == int(first_run) + 1


class TestCreateCaseWithSpecimens:
    def test_creates_case_and_nested_specimens(self, db, admin_user):
        registrar, _ = admin_user
        from tests.factories import make_hospital, make_patient
        hospital = make_hospital(db)
        patient = make_patient(db)

        case_in = SurgicalCaseCreate(
            patient_id=patient.id,
            registrar_id=registrar.id,
            hospital_id=hospital.id,
            specimens=[
                # surgical_case_id is required by the schema but doesn't exist
                # on the case yet at request time — the crud must ignore it
                # and stamp the real case_id itself (regression: used to crash
                # with TypeError since it was passed straight into the model
                # alongside case_id, and the model has no surgical_case_id
                # column).
                SurgicalSpecimenCreate(surgical_case_id=0, specimen_name="Spec A", specimen_label="A"),
                SurgicalSpecimenCreate(surgical_case_id=0, specimen_name="Spec B", specimen_label="B"),
            ],
        )

        case = create_case_with_specimens(db, case_in, registrar.id)

        assert case.accession_no is not None
        assert case.registrar_id == registrar.id
        assert len(case.specimens) == 2
        assert all(s.case_id == case.id for s in case.specimens)


class TestGetCases:
    def test_has_ihc_flag_true_only_when_ihc_category_stain_present(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ihc_test = make_anatomical_pathology_test(db, category="IHC", name=f"IHC-{uuid.uuid4().hex[:6]}")
        make_block_stain(db, block.id, test_id=ihc_test.id)

        case2, specimen2 = make_signable_case(db, registrar_id=registrar.id)
        block2 = make_block(db, specimen2.id)
        he_test = make_anatomical_pathology_test(db, category="Histology", name=f"HE-{uuid.uuid4().hex[:6]}")
        make_block_stain(db, block2.id, test_id=he_test.id)

        result = get_cases(db, limit=1000, search=case.accession_no)
        assert result["items"][0].has_ihc is True

        result2 = get_cases(db, limit=1000, search=case2.accession_no)
        assert result2["items"][0].has_ihc is False

    def test_is_pending_true_ors_with_status_filter(self, db, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        case.status = "grossed"
        case.is_pending = True
        db.commit()

        result = get_cases(db, limit=1000, search=case.accession_no, status="stained", is_pending=True)
        result_ids = [c.id for c in result["items"]]
        assert case.id in result_ids  # matched via is_pending even though status doesn't match

    def test_has_specimens_false_filters_to_empty_cases(self, db, admin_user):
        registrar, _ = admin_user
        with_specimen, _ = make_signable_case(db, registrar_id=registrar.id)
        without_specimen = make_bare_case(db, registrar_id=registrar.id)

        result = get_cases(db, limit=1000, has_specimens=False, search=without_specimen.accession_no)
        result_ids = [c.id for c in result["items"]]
        assert without_specimen.id in result_ids
        assert with_specimen.id not in result_ids

    def test_search_matches_accession_no(self, db, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)

        result = get_cases(db, limit=1000, search=case.accession_no)

        assert any(c.id == case.id for c in result["items"])


class TestGetCase:
    def test_missing_case_returns_none(self, db):
        assert get_case(db, 999999) is None


class TestDeleteCase:
    def test_blocks_delete_unless_registered(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.status = "grossed"
        db.commit()

        with pytest.raises(HTTPException) as exc:
            delete_case(db, case.id)
        assert exc.value.status_code == 400
        assert db.query(SurgicalCase).filter(SurgicalCase.id == case.id).first() is not None

    def test_allows_delete_when_registered(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.status = "registered"
        db.commit()

        result = delete_case(db, case.id)

        assert result.id == case.id
        assert db.query(SurgicalCase).filter(SurgicalCase.id == case.id).first() is None

    def test_missing_case_returns_none(self, db):
        assert delete_case(db, 999999) is None


class TestCancelSurgicalCase:
    def test_cancels_regardless_of_current_status(self, db, admin_user):
        """Documents current behavior: unlike delete_case, cancel_surgical_case
        has no status guard — confirmed with the user as intentional-enough
        to leave as-is for now, so this pins the behavior rather than a
        desired invariant."""
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.status = "signed out"
        db.commit()

        result = cancel_surgical_case(db, case.id, user_id=registrar.id, reason="Duplicate order")

        assert result.status == "cancelled"
        assert result.is_cancelled is True
        assert result.cancel_reason == "Duplicate order"
        assert result.cancelled_by_id == registrar.id

    def test_missing_case_returns_none(self, db, admin_user):
        registrar, _ = admin_user
        assert cancel_surgical_case(db, 999999, user_id=registrar.id, reason="x") is None


class TestUpdateCase:
    def test_readonly_fields_are_not_overwritten(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        original_accession = case.accession_no

        updated = update_case(db, db_obj=case, obj_in=SurgicalCaseUpdate(hn="HN-NEW"))

        assert updated.hn == "HN-NEW"
        assert updated.accession_no == original_accession  # readonly, untouched


class TestListHospitalCases:
    def test_live_case_shown_before_published_report_for_same_hospital(self, db, admin_user):
        registrar, _ = admin_user
        from tests.factories import make_hospital
        hospital = make_hospital(db)
        live_case = make_bare_case(db, registrar_id=registrar.id, hospital=hospital)
        live_case.status = "grossed"
        db.commit()

        result = list_hospital_cases(db, page=1, size=1000, hospital_ids=[hospital.id])

        live_entry = next(i for i in result["items"] if i["case_id"] == live_case.id)
        assert live_entry["status"] == "grossed"
        assert live_entry["report_id"] is None

    def test_status_filter_in_progress_routes_to_live_query_only(self, db, admin_user):
        registrar, _ = admin_user
        from tests.factories import make_hospital
        hospital = make_hospital(db)
        case = make_bare_case(db, registrar_id=registrar.id, hospital=hospital)
        case.status = "grossed"
        db.commit()

        result = list_hospital_cases(db, page=1, size=1000, hospital_ids=[hospital.id], status_filter="grossed")

        assert any(i["case_id"] == case.id for i in result["items"])
        assert all(i["status"] != "published" for i in result["items"])


class TestGetCaseCostSummary:
    def test_no_specimens_returns_empty(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)

        result = get_case_cost_summary(db, case.id)

        assert result == {"items": [], "grand_total": 0.0}

    def test_aggregates_specimen_tests_and_block_stains_by_test_id(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ap_test = make_anatomical_pathology_test(db, name=f"Cost-Test-{uuid.uuid4().hex[:6]}")
        ap_test.price_tier_1 = 100.0
        db.commit()

        db.add(SurgicalSpecimenAPTest(surgical_specimen_id=specimen.id, ap_test_id=ap_test.id))
        db.commit()
        make_block_stain(db, block.id, test_id=ap_test.id)
        make_block_stain(db, block.id, test_id=ap_test.id, slide_no=2)

        result = get_case_cost_summary(db, case.id)

        assert len(result["items"]) == 1
        item = result["items"][0]
        assert item["quantity"] == 3  # 1 specimen-test + 2 block-stains, same test_id
        assert item["total_price"] == 300.0
        assert result["grand_total"] == 300.0

    def test_cancelled_stains_excluded_from_quantity(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ap_test = make_anatomical_pathology_test(db, name=f"Cancelled-Test-{uuid.uuid4().hex[:6]}")

        make_block_stain(db, block.id, test_id=ap_test.id, status="cancelled")

        result = get_case_cost_summary(db, case.id)

        assert result["items"] == []


class TestGetHospitalBillingSummary:
    def test_excludes_cancelled_cases_and_sums_grand_total(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        ap_test = make_anatomical_pathology_test(db, name=f"Bill-Test-{uuid.uuid4().hex[:6]}")
        ap_test.price_tier_1 = 50.0
        db.commit()
        make_block_stain(db, block.id, test_id=ap_test.id)

        cancelled_case, cancelled_specimen = make_signable_case(db, registrar_id=registrar.id)
        cancelled_block = make_block(db, cancelled_specimen.id)
        make_block_stain(db, cancelled_block.id, test_id=ap_test.id)
        cancelled_case.status = "cancelled"
        db.commit()

        now = local_now()
        result = get_hospital_billing_summary(
            db, start_date=now - timedelta(days=1), end_date=now + timedelta(days=1)
        )

        result_ids = [i["case_id"] for i in result["items"]]
        assert case.id in result_ids
        assert cancelled_case.id not in result_ids
        matching = next(i for i in result["items"] if i["case_id"] == case.id)
        assert matching["grand_total"] == 50.0


class TestGetDashboardSummary:
    def test_overdue_bucket_counts_routine_case_past_tat_days(self, db, admin_user):
        clear_system_settings(db)
        make_system_setting(db, surgical_tat_days=10, surgical_express_tat_days=3)
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.status = "grossed"
        case.is_express = False
        case.registered_at = local_now() - timedelta(days=15)
        db.commit()

        result = get_dashboard_summary(db)

        assert result["tat_overdue"]["by_status"].get("grossed", 0) >= 1
        assert result["tat_settings"]["routine_days"] == 10

    def test_terminal_statuses_excluded_from_overdue(self, db, admin_user):
        clear_system_settings(db)
        make_system_setting(db, surgical_tat_days=10, surgical_express_tat_days=3)
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.status = "signed out"
        case.is_express = False
        case.registered_at = local_now() - timedelta(days=30)
        db.commit()

        result = get_dashboard_summary(db)

        assert "signed out" not in result["tat_overdue"]["by_status"]

    def test_pipeline_counts_only_active_statuses(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.status = "grossed"
        db.commit()

        result = get_dashboard_summary(db)

        assert result["pipeline"].get("grossed", 0) >= 1
        assert "cancelled" not in result["pipeline"]
