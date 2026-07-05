"""
Unit tests for app/crud/surgical_report.py — finalize_and_snapshot_orchestrator's
system-setting-driven branches, create_final_report_snapshot,
get_pending_cosign_worklist, and the report list/pagination/search helpers.
Previously only exercised via the happy-path in test_surgical_consult_finalize.py.
"""

import pytest
from fastapi import HTTPException

from app.crud.surgical_report import (
    finalize_and_snapshot_orchestrator,
    create_final_report_snapshot,
    get_pending_cosign_worklist,
    get_all_reports_paginated,
    get_reports_paginated,
    get_reports_by_case,
)
from app.models.surgical_report import SurgicalReport, ReportStatus, ReportSigner, SurgicalReportImage

from tests.factories import (
    make_signable_case,
    build_bulk_save_payload,
    make_system_setting,
    clear_system_settings,
    make_hospital,
)


class TestFinalizeRequireAllPathologistsSign:
    def test_only_one_of_two_signs_stays_draft(self, db, admin_user, two_pathologists):
        make_system_setting(db, require_all_pathologists_sign=True)
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
        )
        report = finalize_and_snapshot_orchestrator(db, case.id, payload, path1.id)

        assert report.status == ReportStatus.DRAFT
        db.refresh(case)
        assert case.status != "signed out"

    def test_second_signer_completing_publishes(self, db, admin_user, two_pathologists):
        make_system_setting(db, require_all_pathologists_sign=True)
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        payload1 = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
        )
        finalize_and_snapshot_orchestrator(db, case.id, payload1, path1.id)

        payload2 = build_bulk_save_payload(
            case.id, specimen.id, path2.id,
            pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
        )
        report2 = finalize_and_snapshot_orchestrator(db, case.id, payload2, path2.id)

        assert report2.status == ReportStatus.PUBLISHED
        db.refresh(case)
        assert case.status == "signed out"

    def test_no_settings_row_behaves_as_require_all_true(self, db, admin_user, two_pathologists):
        clear_system_settings(db)
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
        )
        report = finalize_and_snapshot_orchestrator(db, case.id, payload, path1.id)

        assert report.status == ReportStatus.DRAFT

    def test_approve_system_enabled_routes_to_pending_review(self, db, admin_user, two_pathologists):
        make_system_setting(db, require_all_pathologists_sign=False, enable_approve_system=True)
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        payload = build_bulk_save_payload(case.id, specimen.id, path1.id)
        report = finalize_and_snapshot_orchestrator(db, case.id, payload, path1.id)

        assert report.status == ReportStatus.PENDING_APPROVAL
        db.refresh(case)
        assert case.status == "pending peer review"


class TestFinalizeOtherBranches:
    def test_addendum_round_increments_diagnosis_order(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)
        finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        signers = db.query(ReportSigner).filter(ReportSigner.user_id == path1.id).all()
        orders = sorted({s.diagnosis_order for s in signers})
        assert orders == [1, 2]

    def test_quality_fields_persisted_onto_case(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        payload = build_bulk_save_payload(
            case.id, specimen.id, path1.id,
            stain_quality="good", tissue_quality="fair", slide_quality="poor",
        )
        finalize_and_snapshot_orchestrator(db, case.id, payload, path1.id)

        db.refresh(case)
        assert case.stain_quality == "good"
        assert case.tissue_quality == "fair"
        assert case.slide_quality == "poor"

    def test_missing_case_raises_and_persists_nothing(self, db, admin_user, two_pathologists):
        path1, _ = two_pathologists
        payload = build_bulk_save_payload(999999, 1, path1.id)
        with pytest.raises(Exception):
            finalize_and_snapshot_orchestrator(db, 999999, payload, path1.id)
        assert db.query(SurgicalReport).filter(SurgicalReport.case_id == 999999).first() is None


class TestCreateFinalReportSnapshot:
    def test_missing_case_returns_none(self, db, admin_user):
        assert create_final_report_snapshot(db, case_id=999999) is None

    def test_insert_path_creates_report_and_marks_case_reported(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        # A prior finalize already created a report; call again with no report_id
        # to exercise the "insert vs update" fallback query directly.
        report = create_final_report_snapshot(db, case_id=case.id)
        assert report is not None
        db.refresh(case)
        assert case.is_reported is True
        assert case.report_at is not None

    def test_update_path_clears_stale_report_images(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        report = finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        stale_image = SurgicalReportImage(report_id=report.id, image_url="/stale.jpg")
        db.add(stale_image)
        db.commit()
        assert db.query(SurgicalReportImage).filter(SurgicalReportImage.report_id == report.id).count() == 1

        create_final_report_snapshot(db, case_id=case.id, report_id=report.id)

        assert db.query(SurgicalReportImage).filter(SurgicalReportImage.report_id == report.id).count() == 0

    def test_no_report_id_falls_back_to_most_recent(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        older = SurgicalReport(case_id=case.id, hospital_id=1, status=ReportStatus.PUBLISHED)
        db.add(older)
        db.commit()

        report = finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)
        newer_id = report.id

        result = create_final_report_snapshot(db, case_id=case.id)
        assert result.id == newer_id
        assert result.id != older.id


class TestGetPendingCosignWorklist:
    def test_excludes_primary_signers_own_entry(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db, require_all_pathologists_sign=True)
        finalize_and_snapshot_orchestrator(
            db, case.id,
            build_bulk_save_payload(
                case.id, specimen.id, path1.id,
                pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
            ),
            path1.id,
        )

        worklist = get_pending_cosign_worklist(db, user_id=path1.id)
        assert worklist["total"] == 0

    def test_includes_unsigned_cosigner_entry(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db, require_all_pathologists_sign=True)
        finalize_and_snapshot_orchestrator(
            db, case.id,
            build_bulk_save_payload(
                case.id, specimen.id, path1.id,
                pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
            ),
            path1.id,
        )

        worklist = get_pending_cosign_worklist(db, user_id=path2.id)
        assert worklist["total"] == 1

    def test_excludes_already_signed_cosigner_entry(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db, require_all_pathologists_sign=True)
        pathologists = [{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}]
        finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id, pathologists=pathologists),
            path1.id,
        )
        finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path2.id, pathologists=pathologists),
            path2.id,
        )

        worklist = get_pending_cosign_worklist(db, user_id=path2.id)
        assert worklist["total"] == 0

    def test_excludes_cancelled_reports(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db, require_all_pathologists_sign=True)
        report = finalize_and_snapshot_orchestrator(
            db, case.id,
            build_bulk_save_payload(
                case.id, specimen.id, path1.id,
                pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
            ),
            path1.id,
        )
        report.status = ReportStatus.CANCELLED
        db.commit()

        worklist = get_pending_cosign_worklist(db, user_id=path2.id)
        assert worklist["total"] == 0

    def test_search_filters_by_accession_no(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        make_system_setting(db, require_all_pathologists_sign=True)
        finalize_and_snapshot_orchestrator(
            db, case.id,
            build_bulk_save_payload(
                case.id, specimen.id, path1.id,
                pathologists=[{"user_id": path1.id, "role": "primary"}, {"user_id": path2.id, "role": "co-signer"}],
            ),
            path1.id,
        )

        match = get_pending_cosign_worklist(db, user_id=path2.id, search=case.accession_no)
        assert match["total"] == 1
        no_match = get_pending_cosign_worklist(db, user_id=path2.id, search="NO-SUCH-CASE-XYZ")
        assert no_match["total"] == 0


class TestGetAllReportsPaginated:
    def test_filters_by_status(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case1, spec1 = make_signable_case(db, registrar_id=registrar.id)
        finalize_and_snapshot_orchestrator(db, case1.id, build_bulk_save_payload(case1.id, spec1.id, path1.id), path1.id)

        result = get_all_reports_paginated(db, status_filter="published")
        assert result["total"] >= 1
        assert all(r.status == "published" for r in result["items"])

        result_draft = get_all_reports_paginated(db, status_filter="draft")
        assert all(r.status == "draft" for r in result_draft["items"])

    def test_filters_by_hospital_id(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        case_a, spec_a = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_a)
        case_b, spec_b = make_signable_case(db, registrar_id=registrar.id, hospital=hosp_b)
        finalize_and_snapshot_orchestrator(db, case_a.id, build_bulk_save_payload(case_a.id, spec_a.id, path1.id), path1.id)
        finalize_and_snapshot_orchestrator(db, case_b.id, build_bulk_save_payload(case_b.id, spec_b.id, path1.id), path1.id)

        result = get_all_reports_paginated(db, hospital_id=hosp_a.id)
        assert all(r.hospital_id == hosp_a.id for r in result["items"])
        assert any(r.case_id == case_a.id for r in result["items"])
        assert not any(r.case_id == case_b.id for r in result["items"])

    def test_filters_by_is_print(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        report = finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)
        report.is_print = True
        db.commit()

        result = get_all_reports_paginated(db, is_print=True)
        assert any(r.id == report.id for r in result["items"])
        assert all(r.is_print is True for r in result["items"])

    def test_search_status_prefix_overrides_plain_text(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        result = get_all_reports_paginated(db, search="status:published")
        assert all(r.status == "published" for r in result["items"])

    def test_pagination_math(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        for _ in range(3):
            case, specimen = make_signable_case(db, registrar_id=registrar.id)
            finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        page1 = get_all_reports_paginated(db, page=1, size=1, status_filter="published")
        page2 = get_all_reports_paginated(db, page=2, size=1, status_filter="published")
        assert len(page1["items"]) == 1
        assert len(page2["items"]) == 1
        assert page1["items"][0].id != page2["items"][0].id
        assert page1["total"] == page2["total"] >= 3


class TestGetReportsPaginatedPerCase:
    def test_status_prefix_pending_and_published_recognized(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        published = get_reports_paginated(db, case_id=case.id, search="status:published")
        assert published["total"] == 1
        pending = get_reports_paginated(db, case_id=case.id, search="status:pending")
        assert pending["total"] == 0

    def test_unrecognized_status_prefix_applies_no_filter(self, db, admin_user, two_pathologists):
        """Documents current behavior: search="status:draft" (or any value other
        than pending/published) matches neither branch in get_reports_paginated,
        so no filter is applied and all of the case's reports are returned."""
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        result = get_reports_paginated(db, case_id=case.id, search="status:draft")
        assert result["total"] == 1  # the published report is still returned

    def test_plain_text_search_still_works(self, db, admin_user, two_pathologists):
        # get_reports_paginated (per-case) searches diagnosis_summary/
        # pathologist_name/patient_name/patient_ln — NOT accession_no (that's
        # only searched by get_all_reports_paginated).
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        match = get_reports_paginated(db, case_id=case.id, search=path1.full_name)
        assert match["total"] == 1
        no_match = get_reports_paginated(db, case_id=case.id, search="NO-SUCH-PATHOLOGIST-XYZ")
        assert no_match["total"] == 0


class TestGetReportsByCase:
    def test_returns_created_report(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        report = finalize_and_snapshot_orchestrator(db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id)

        reports = get_reports_by_case(db, case.id)
        assert report.id in [r.id for r in reports]
