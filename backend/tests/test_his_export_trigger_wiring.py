"""Integration tests for the 5 CRUD-layer HIS-export enqueue trigger points
(see CLAUDE.md's HIS export section / app/his_export/README.md). Verifies:
  1. surgical direct-publish (finalize_and_snapshot_orchestrator)
  2. surgical senior-approval (process_report_approval)
  3. gyne direct-publish (publish_gyne_report)
  4. gyne QC-review agree (complete_gyne_review)
  5. nongyne senior-approval (process_nongyne_report_approval)
and the negative case: publish_nongyne_report() alone must NOT enqueue,
since it never reaches PUBLISHED by itself (it always routes to
pending_approval — process_nongyne_report_approval is the only terminal
point for that domain).

Sites 4 and 5 also regression-test a staleness bug found during review: the
enqueue call must run AFTER each domain's signers_snapshot sync, not before
it, or the exported payload would miss the signature that was just recorded."""

import app.his_export as his_export_config
from app.crud.gyne_cyto_report import publish_gyne_report, complete_gyne_review
from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.crud.nongyne_cyto_report import publish_nongyne_report, process_nongyne_report_approval
from app.crud.report_crud import process_report_approval
from app.crud.surgical_report import finalize_and_snapshot_orchestrator
from app.models.his_export_log import HisExportLog
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from app.schemas.report_approval import ReportApproveRequest

from tests.factories import (
    make_bare_gyne_case,
    make_signable_case,
    build_bulk_save_payload,
    make_system_setting,
    make_pending_nongyne_report,
)


def _req(action, **kwargs):
    return ReportApproveRequest(action=action, **kwargs)


def _logs_for(db, resource_type, resource_id):
    return db.query(HisExportLog).filter(
        HisExportLog.resource_type == resource_type, HisExportLog.resource_id == resource_id,
    ).all()


def _enable_export(monkeypatch):
    """monkeypatch HIS_EXPORT_TYPE so enqueue() actually inserts — with the
    default "none", none of these trigger points would produce a row at all,
    which is correct behavior but not what this file is testing."""
    monkeypatch.setattr(his_export_config, "HIS_EXPORT_TYPE", "generic_webhook")


class TestSurgicalDirectPublishTrigger:
    def test_finalize_without_approval_system_enqueues_once(self, db, admin_user, pathologist_user, monkeypatch):
        _enable_export(monkeypatch)
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db, require_all_pathologists_sign=False, enable_approve_system=False)
        case, specimen = make_signable_case(db, registrar_id=registrar.id)

        report = finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, pathologist.id), pathologist.id,
        )

        logs = _logs_for(db, "SurgicalReport", report.id)
        assert len(logs) == 1
        assert logs[0].status == "pending"
        assert logs[0].accession_no == report.accession_no
        assert logs[0].payload_snapshot["diagnosis_text"]


class TestSurgicalApprovalTrigger:
    def test_senior_approve_enqueues_once(self, db, admin_user, pathologist_user, monkeypatch):
        _enable_export(monkeypatch)
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db, require_all_pathologists_sign=False, enable_approve_system=True)
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        report = finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, pathologist.id), pathologist.id,
        )
        # enable_approve_system routes to PENDING_APPROVAL, not PUBLISHED —
        # no row yet from the finalize step itself.
        assert _logs_for(db, "SurgicalReport", report.id) == []

        process_report_approval(db, report.id, pathologist, _req("APPROVE"))

        logs = _logs_for(db, "SurgicalReport", report.id)
        assert len(logs) == 1


class TestGynePublishTrigger:
    def test_non_abnormal_direct_publish_enqueues_once(self, db, admin_user, pathologist_user, monkeypatch):
        _enable_export(monkeypatch)
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        make_system_setting(db, enable_gyne_qc_system=False)
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))

        report = publish_gyne_report(
            db, case.id,
            signers=[{"user_id": pathologist.id, "role": "primary"}],
            current_user_id=pathologist.id,
            is_abnormal=False,
        )

        logs = _logs_for(db, "GyneCytoReport", report.id)
        assert len(logs) == 1
        assert logs[0].accession_no == report.accession_no


class TestGyneCompleteReviewTrigger:
    def test_agree_enqueues_with_freshly_synced_signer(self, db, admin_user, pathologist_user, monkeypatch):
        """Regression test: enqueue must run AFTER the signers_snapshot sync
        in complete_gyne_review's agree branch, not right after published_at
        is set — otherwise the exported payload's signer list would show the
        reviewer as not-yet-signed even though they just signed."""
        _enable_export(monkeypatch)
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        report = publish_gyne_report(
            db, case.id,
            signers=[{"user_id": pathologist.id, "role": "primary"}],
            current_user_id=None,
            is_abnormal=True,  # routes to pending_review, not published
        )
        # Force a pre-review "not yet signed" snapshot so the sync is observable.
        report.signers_snapshot = [{"user_id": pathologist.id, "role": "primary", "signed_at": None}]
        db.commit()

        complete_gyne_review(db, case.id, reviewer_id=pathologist.id, review_result="agree")

        logs = _logs_for(db, "GyneCytoReport", report.id)
        assert len(logs) == 1
        signer_entry = next(s for s in logs[0].payload_snapshot["signers"] if s["user_id"] == pathologist.id)
        assert signer_entry["signed_at"] is not None

    def test_disagree_does_not_enqueue(self, db, admin_user, pathologist_user, monkeypatch):
        _enable_export(monkeypatch)
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        report = publish_gyne_report(
            db, case.id,
            signers=[{"user_id": pathologist.id, "role": "primary"}],
            current_user_id=None,
            is_abnormal=True,
        )

        complete_gyne_review(db, case.id, reviewer_id=pathologist.id, review_result="disagree")

        assert _logs_for(db, "GyneCytoReport", report.id) == []


class TestNongyneApprovalTrigger:
    def test_publish_alone_does_not_enqueue(self, db, admin_user, pathologist_user, monkeypatch):
        """publish_nongyne_report() always routes to pending_approval and
        never reaches PUBLISHED by itself — confirms it must NOT be a
        trigger point (process_nongyne_report_approval is the only one)."""
        _enable_export(monkeypatch)
        from app.crud.nongyne_diagnosis import create_nongyne_diagnosis
        from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate
        from tests.factories import make_bare_nongyne_case

        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis"))

        report = publish_nongyne_report(
            db, case.id,
            signers=[{"user_id": pathologist.id, "role": "primary"}],
            current_user_id=pathologist.id,
        )

        assert report.status.value == "pending"
        assert _logs_for(db, "NongyneCytoReport", report.id) == []

    def test_approve_enqueues_with_freshly_synced_signer(self, db, admin_user, pathologist_user, monkeypatch):
        """Regression test: enqueue must run AFTER _stamp_snapshot_signed_at,
        not right after published_at is set — otherwise the exported
        payload's signer list would miss the approval signature."""
        _enable_export(monkeypatch)
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case, report = make_pending_nongyne_report(db, registrar.id, pathologist.id)
        # Force a pre-approval "not yet signed" snapshot so the sync is observable.
        report.signers_snapshot = [{"user_id": pathologist.id, "role": "primary", "signed_at": None}]
        db.commit()

        process_nongyne_report_approval(db, report.id, pathologist, _req("APPROVE"))

        logs = _logs_for(db, "NongyneCytoReport", report.id)
        assert len(logs) == 1
        signer_entry = next(s for s in logs[0].payload_snapshot["signers"] if s["user_id"] == pathologist.id)
        assert signer_entry["signed_at"] is not None
