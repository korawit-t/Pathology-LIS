"""
Tests for the report approval/cosign state machines: process_report_approval/
process_cosign (Surgical), process_gyne_report_approval/process_gyne_cosign
(Gyne), process_nongyne_report_approval/process_nongyne_cosign (NonGyne).

Previously only exercised via mocked-DB 403-guard tests in
test_report_signers.py — this file exercises real state transitions against
a real DB session.

process_nongyne_report_approval's REJECT branch used to set the report back
to PENDING_APPROVAL instead of DRAFT (a copy-paste divergence from the
Surgical/Gyne siblings, which both correctly revert to DRAFT). Since the
tests in this file force enable_non_gyne_approve_system=True (via
make_pending_nongyne_report) so reports reliably land in PENDING_APPROVAL,
that bug made reject a functional no-op here. TestNongyneApproval::test_reject_moves_to_draft
is the regression test for the fix.
"""

import uuid
import pytest
from fastapi import HTTPException

from app.crud.report_crud import process_report_approval, process_cosign, add_signer_to_report
from app.crud.gyne_report_crud import process_gyne_report_approval, process_gyne_cosign, add_gyne_signer
from app.crud.nongyne_cyto_report import (
    process_nongyne_report_approval,
    process_nongyne_cosign,
    add_nongyne_signer,
)
from app.crud.surgical_report import finalize_and_snapshot_orchestrator
from app.schemas.report_approval import ReportApproveRequest
from app.models.surgical_report import ReportStatus, ReportSigner
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.gyne_cyto_report import GyneReportStatus, GyneReportSigner
from app.models.nongyne_cyto_report import NongyneReportStatus, NongyneReportSigner

from tests.factories import (
    make_signable_case,
    build_bulk_save_payload,
    make_system_setting,
    make_pending_gyne_report,
    make_pending_nongyne_report,
)
from tests.conftest import _make_user


def _pending_surgical_report(db, registrar_id, pathologist_id):
    make_system_setting(db, require_all_pathologists_sign=False, enable_approve_system=True)
    case, specimen = make_signable_case(db, registrar_id=registrar_id)
    report = finalize_and_snapshot_orchestrator(
        db, case.id, build_bulk_save_payload(case.id, specimen.id, pathologist_id), pathologist_id
    )
    db.refresh(case)
    return case, report


def _req(action, **kwargs):
    return ReportApproveRequest(action=action, **kwargs)


class TestSurgicalApproval:
    def test_approve_publishes_signs_out_case_and_diagnoses(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, report = _pending_surgical_report(db, registrar.id, path1.id)

        result = process_report_approval(db, report.id, path1, _req("APPROVE"))

        assert result.status == ReportStatus.PUBLISHED
        assert result.approved_at is not None
        assert result.published_at is not None
        db.refresh(case)
        assert case.status == "signed out"
        assert case.is_reported is True
        signed = db.query(SurgicalDiagnosis).filter(
            SurgicalDiagnosis.case_id == case.id, SurgicalDiagnosis.status == "signed"
        ).count()
        assert signed >= 1

    def test_reject_reverts_case_diagnoses_and_clears_all_signers(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = _pending_surgical_report(db, registrar.id, path1.id)
        add_signer_to_report(db, report.id, path2.id, "co-signer", None, current_user=path1)
        # The primary signer (path1) is already signed_at from finalize; also
        # mark the co-signer as signed, so reject's "clear all" is meaningful.
        db.query(ReportSigner).filter(
            ReportSigner.report_id == report.id, ReportSigner.user_id == path2.id
        ).update({"signed_at": report.created_at})
        db.commit()

        result = process_report_approval(db, report.id, path1, _req("REJECT"))

        assert result.status == ReportStatus.DRAFT
        db.refresh(case)
        assert case.is_reported is False
        assert case.status == "grossed"  # is_slide_prepped defaults False
        signed_left = db.query(SurgicalDiagnosis).filter(
            SurgicalDiagnosis.case_id == case.id, SurgicalDiagnosis.status == "signed"
        ).count()
        assert signed_left == 0
        signers = db.query(ReportSigner).filter(ReportSigner.report_id == report.id).all()
        assert all(s.signed_at is None for s in signers)

    def test_reject_with_slide_prepped_case_goes_to_stained(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, report = _pending_surgical_report(db, registrar.id, path1.id)
        case.is_slide_prepped = True
        db.commit()

        process_report_approval(db, report.id, path1, _req("REJECT"))

        db.refresh(case)
        assert case.status == "stained"

    def test_existing_signer_gets_agreement_stamped_regardless_of_action(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, report = _pending_surgical_report(db, registrar.id, path1.id)

        process_report_approval(db, report.id, path1, _req("REJECT", agreement="agree", agreement_note="looks fine"))

        signer = db.query(ReportSigner).filter(
            ReportSigner.report_id == report.id, ReportSigner.user_id == path1.id
        ).first()
        assert signer.agreement == "agree"
        assert signer.agreement_note == "looks fine"

    def test_unknown_action_raises_400(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, report = _pending_surgical_report(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_report_approval(db, report.id, path1, _req("BOGUS"))
        assert exc.value.status_code == 400

    def test_approval_log_row_written(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, report = _pending_surgical_report(db, registrar.id, path1.id)

        process_report_approval(db, report.id, path1, _req("APPROVE"))

        from app.models.surgical_report import ReportApprovalLog
        log = db.query(ReportApprovalLog).filter(ReportApprovalLog.report_id == report.id).first()
        assert log is not None
        assert log.action == "APPROVE"
        assert log.approver_id == path1.id

    def test_cosign_non_cosigner_gets_403(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = _pending_surgical_report(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_cosign(db, report.id, path2, _req("APPROVE"))
        assert exc.value.status_code == 403

    def test_cosign_primary_signer_cannot_cosign_403(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, report = _pending_surgical_report(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_cosign(db, report.id, path1, _req("APPROVE"))
        assert exc.value.status_code == 403

    def test_cosign_stamps_signed_at_without_changing_report_status(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case, report = _pending_surgical_report(db, registrar.id, path1.id)
        add_signer_to_report(db, report.id, path2.id, "co-signer", None, current_user=path1)

        process_cosign(db, report.id, path2, _req("APPROVE", agreement="agree"))

        signer = db.query(ReportSigner).filter(
            ReportSigner.report_id == report.id, ReportSigner.user_id == path2.id
        ).first()
        assert signer.signed_at is not None
        assert signer.agreement == "agree"
        db.refresh(report)
        assert report.status == ReportStatus.PENDING_APPROVAL


def _pending_outside_qc(db, registrar_id, pathologist_id):
    """A pending gyne report whose case is no longer in pending_review.

    A gyne report is only ever "pending" while its case awaits QC review, and
    /approvals/gyne refuses to act on those (see TestGyneApprovalBlockedByQc).
    This state survives only in data from before that guard — e.g. a case
    status PATCHed by hand — and it's the one /approvals/gyne still acts on."""
    case, report = make_pending_gyne_report(db, registrar_id, pathologist_id)
    case.status = "screened"
    db.commit()
    return case, report


class TestGyneApproval:
    def test_approve_publishes_case_and_report(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = _pending_outside_qc(db, registrar.id, path1.id)

        result = process_gyne_report_approval(db, report.id, path1, _req("APPROVE"))

        assert result.status == GyneReportStatus.PUBLISHED
        db.refresh(case)
        assert case.status == "published"
        assert case.report_at is not None

    def test_approve_auto_creates_missing_signer_role_primary_for_pathologist(
        self, db, admin_user, pathologist_user
    ):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        path2, _ = _make_user(db, f"gpath2_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
        case, report = _pending_outside_qc(db, registrar.id, path1.id)
        assert db.query(GyneReportSigner).filter(
            GyneReportSigner.report_id == report.id, GyneReportSigner.user_id == path2.id
        ).count() == 0

        process_gyne_report_approval(db, report.id, path2, _req("APPROVE"))

        signer = db.query(GyneReportSigner).filter(
            GyneReportSigner.report_id == report.id, GyneReportSigner.user_id == path2.id
        ).first()
        assert signer is not None
        assert signer.role == "primary"
        assert signer.signed_at is not None

    def test_approve_auto_creates_signer_role_cytotechnologist(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        ct_user, _ = _make_user(db, f"ct_{uuid.uuid4().hex[:6]}", "CtPass1!", ["cytotechnologist"])
        case, report = _pending_outside_qc(db, registrar.id, path1.id)

        process_gyne_report_approval(db, report.id, ct_user, _req("APPROVE"))

        signer = db.query(GyneReportSigner).filter(
            GyneReportSigner.report_id == report.id, GyneReportSigner.user_id == ct_user.id
        ).first()
        assert signer.role == "cytotechnologist"

    def test_reject_reverts_status_only(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = _pending_outside_qc(db, registrar.id, path1.id)

        result = process_gyne_report_approval(db, report.id, path1, _req("REJECT"))

        assert result.status == GyneReportStatus.DRAFT
        db.refresh(case)
        assert case.status == "screened"
        assert case.is_reported is False
        # Gyne reject does NOT clear signers (unlike Surgical)
        signer = db.query(GyneReportSigner).filter(
            GyneReportSigner.report_id == report.id, GyneReportSigner.user_id == path1.id
        ).first()
        assert signer.signed_at is not None

    def test_unknown_action_raises_400(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = _pending_outside_qc(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_gyne_report_approval(db, report.id, path1, _req("BOGUS"))
        assert exc.value.status_code == 400

    def test_audit_log_row_written(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = _pending_outside_qc(db, registrar.id, path1.id)

        process_gyne_report_approval(db, report.id, path1, _req("APPROVE"))

        from app.models.cyto_approval_log import CytoReportAuditLog
        log = db.query(CytoReportAuditLog).filter(
            CytoReportAuditLog.report_type == "gyne", CytoReportAuditLog.report_id == report.id
        ).first()
        assert log is not None
        assert log.action == "APPROVE"

    def test_cosign_non_cosigner_gets_403(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        other, _ = _make_user(db, f"gother_{uuid.uuid4().hex[:6]}", "OtherPass1!", ["pathologist"])
        case, report = make_pending_gyne_report(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_gyne_cosign(db, report.id, other, _req("APPROVE"))
        assert exc.value.status_code == 403

    def test_cosign_primary_signer_cannot_cosign_403(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = make_pending_gyne_report(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_gyne_cosign(db, report.id, path1, _req("APPROVE"))
        assert exc.value.status_code == 403

    def test_cosign_stamps_signed_at_without_changing_report_status(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        cosigner, _ = _make_user(db, f"gcosign_{uuid.uuid4().hex[:6]}", "CosignPass1!", ["senior_pathologist"])
        case, report = make_pending_gyne_report(db, registrar.id, path1.id)
        add_gyne_signer(db, report.id, cosigner.id, "co-signer", None, current_user=path1)

        process_gyne_cosign(db, report.id, cosigner, _req("APPROVE", agreement="agree"))

        signer = db.query(GyneReportSigner).filter(
            GyneReportSigner.report_id == report.id, GyneReportSigner.user_id == cosigner.id
        ).first()
        assert signer.signed_at is not None
        db.refresh(report)
        assert report.status == GyneReportStatus.PENDING_APPROVAL

    def test_approve_blocked_when_require_all_gyne_sign_and_cosigner_unsigned(
        self, db, admin_user, pathologist_user
    ):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        cosigner, _ = _make_user(db, f"gcosign_{uuid.uuid4().hex[:6]}", "CosignPass1!", ["senior_pathologist"])
        case, report = _pending_outside_qc(db, registrar.id, path1.id)
        add_gyne_signer(db, report.id, cosigner.id, "co-signer", None, current_user=path1)
        make_system_setting(db, require_all_gyne_sign=True)

        with pytest.raises(HTTPException) as exc:
            process_gyne_report_approval(db, report.id, path1, _req("APPROVE"))
        assert exc.value.status_code == 409
        # Names who is outstanding, not just how many.
        assert cosigner.full_name in exc.value.detail
        db.refresh(report)
        assert report.status == GyneReportStatus.PENDING_APPROVAL

    def test_approve_publishes_once_all_required_gyne_signers_signed(
        self, db, admin_user, pathologist_user
    ):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        cosigner, _ = _make_user(db, f"gcosign_{uuid.uuid4().hex[:6]}", "CosignPass1!", ["senior_pathologist"])
        case, report = _pending_outside_qc(db, registrar.id, path1.id)
        add_gyne_signer(db, report.id, cosigner.id, "co-signer", None, current_user=path1)
        make_system_setting(db, require_all_gyne_sign=True)
        process_gyne_cosign(db, report.id, cosigner, _req("APPROVE", agreement="agree"))

        result = process_gyne_report_approval(db, report.id, path1, _req("APPROVE"))

        assert result.status == GyneReportStatus.PUBLISHED


class TestGyneApprovalBlockedByQc:
    """/approvals/gyne must not settle a QC review: CAN_APPROVE_GYNE_CYTO includes
    the cytotechnologist whose screening is under review, and approving records
    no pathologist verdict. complete_gyne_review is the only way out."""

    def _qc_denials(self, db, case_id):
        from app.models.audit_log import AuditLog
        return (
            db.query(AuditLog)
            .filter(
                AuditLog.action == "QC_BYPASS_BLOCKED",
                AuditLog.resource_type == "GyneCytologyCase",
                AuditLog.resource_id == case_id,
            )
            .all()
        )

    @pytest.mark.parametrize("action", ["APPROVE", "REJECT"])
    def test_refused_while_the_case_awaits_qc_review(self, db, admin_user, pathologist_user, action):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        ct_user, _ = _make_user(db, f"ct_{uuid.uuid4().hex[:6]}", "CtPass1!", ["cytotechnologist"])
        case, report = make_pending_gyne_report(db, registrar.id, path1.id)
        assert case.status == "pending_review"

        with pytest.raises(HTTPException) as exc:
            process_gyne_report_approval(db, report.id, ct_user, _req(action))

        assert exc.value.status_code == 409
        db.refresh(case)
        db.refresh(report)
        assert case.status == "pending_review"
        assert report.status == GyneReportStatus.PENDING_APPROVAL
        denials = self._qc_denials(db, case.id)
        assert len(denials) == 1
        assert denials[0].user_id == ct_user.id
        assert denials[0].new_values["attempted"] == f"approval:{action}"

    def test_refused_even_when_every_signer_has_signed(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        make_system_setting(db, require_all_gyne_sign=True)
        case, report = make_pending_gyne_report(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_gyne_report_approval(db, report.id, path1, _req("APPROVE"))
        assert exc.value.status_code == 409

    def test_cannot_approve_a_report_the_reviewer_sent_back(self, db, admin_user, pathologist_user):
        """A Disagree leaves the report in draft for the cytotech to correct;
        approving it would publish the rejected call with no fresh review."""
        from app.crud.gyne_cyto_report import complete_gyne_review

        registrar, _ = admin_user
        path1, _ = pathologist_user
        reviewer, _ = _make_user(db, f"rev_{uuid.uuid4().hex[:6]}", "RevPass1!", ["pathologist"])
        ct_user, _ = _make_user(db, f"ct_{uuid.uuid4().hex[:6]}", "CtPass1!", ["cytotechnologist"])
        case, report = make_pending_gyne_report(db, registrar.id, path1.id)
        complete_gyne_review(db, case.id, reviewer_id=reviewer.id, review_result="disagree")
        db.refresh(report)
        assert report.status == GyneReportStatus.DRAFT

        with pytest.raises(HTTPException) as exc:
            process_gyne_report_approval(db, report.id, ct_user, _req("APPROVE"))

        assert exc.value.status_code == 409
        db.refresh(report)
        assert report.status == GyneReportStatus.DRAFT
        assert len(self._qc_denials(db, case.id)) == 1


class TestNongyneApproval:
    def test_approve_publishes_case_and_report(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)

        result = process_nongyne_report_approval(db, report.id, path1, _req("APPROVE"))

        assert result.status == NongyneReportStatus.PUBLISHED
        db.refresh(case)
        assert case.status == "published"

    def test_reject_moves_to_draft(self, db, admin_user, pathologist_user):
        """Regression test for the fix: reject used to send the report back
        to PENDING_APPROVAL instead of DRAFT, making it a functional no-op."""
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)

        result = process_nongyne_report_approval(db, report.id, path1, _req("REJECT"))

        assert result.status == NongyneReportStatus.DRAFT
        db.refresh(case)
        assert case.status == "screened"
        assert case.is_reported is False

    def test_approve_auto_creates_missing_signer_always_primary(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        ct_user, _ = _make_user(db, f"nct_{uuid.uuid4().hex[:6]}", "CtPass1!", ["cytotechnologist"])
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)
        assert db.query(NongyneReportSigner).filter(
            NongyneReportSigner.report_id == report.id, NongyneReportSigner.user_id == ct_user.id
        ).count() == 0

        process_nongyne_report_approval(db, report.id, ct_user, _req("APPROVE"))

        signer = db.query(NongyneReportSigner).filter(
            NongyneReportSigner.report_id == report.id, NongyneReportSigner.user_id == ct_user.id
        ).first()
        assert signer is not None
        assert signer.role == "primary"  # no role-inference, unlike Gyne

    def test_approve_stamps_signers_snapshot(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)
        assert report.signers_snapshot  # populated by publish_nongyne_report
        # Simulate an unsigned snapshot entry for this user.
        report.signers_snapshot = [{**s, "signed_at": None} for s in report.signers_snapshot]
        db.commit()

        process_nongyne_report_approval(db, report.id, path1, _req("APPROVE"))

        db.refresh(report)
        entry = next(s for s in report.signers_snapshot if s["user_id"] == path1.id)
        assert entry["signed_at"] is not None

    def test_unknown_action_raises_400(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_nongyne_report_approval(db, report.id, path1, _req("BOGUS"))
        assert exc.value.status_code == 400

    def test_audit_log_row_written(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)

        process_nongyne_report_approval(db, report.id, path1, _req("APPROVE"))

        from app.models.cyto_approval_log import CytoReportAuditLog
        log = db.query(CytoReportAuditLog).filter(
            CytoReportAuditLog.report_type == "nongyne", CytoReportAuditLog.report_id == report.id
        ).first()
        assert log is not None

    def test_cosign_non_cosigner_gets_403(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        other, _ = _make_user(db, f"nother_{uuid.uuid4().hex[:6]}", "OtherPass1!", ["pathologist"])
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_nongyne_cosign(db, report.id, other, _req("APPROVE"))
        assert exc.value.status_code == 403

    def test_cosign_primary_signer_cannot_cosign_403(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)

        with pytest.raises(HTTPException) as exc:
            process_nongyne_cosign(db, report.id, path1, _req("APPROVE"))
        assert exc.value.status_code == 403

    def test_cosign_stamps_signed_at_without_changing_report_status(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        cosigner, _ = _make_user(db, f"ncosign_{uuid.uuid4().hex[:6]}", "CosignPass1!", ["senior_pathologist"])
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)
        add_nongyne_signer(db, report.id, cosigner.id, "co-signer", None, current_user=path1)

        process_nongyne_cosign(db, report.id, cosigner, _req("APPROVE", agreement="agree"))

        signer = db.query(NongyneReportSigner).filter(
            NongyneReportSigner.report_id == report.id, NongyneReportSigner.user_id == cosigner.id
        ).first()
        assert signer.signed_at is not None
        db.refresh(report)
        assert report.status == NongyneReportStatus.PENDING_APPROVAL

    def test_approve_blocked_when_require_all_non_gyne_sign_and_cosigner_unsigned(
        self, db, admin_user, pathologist_user
    ):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        cosigner, _ = _make_user(db, f"ncosign_{uuid.uuid4().hex[:6]}", "CosignPass1!", ["senior_pathologist"])
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)
        add_nongyne_signer(db, report.id, cosigner.id, "co-signer", None, current_user=path1)
        make_system_setting(db, require_all_non_gyne_sign=True)

        with pytest.raises(HTTPException) as exc:
            process_nongyne_report_approval(db, report.id, path1, _req("APPROVE"))
        assert exc.value.status_code == 409
        # Names who is outstanding, not just how many.
        assert cosigner.full_name in exc.value.detail
        db.refresh(report)
        assert report.status == NongyneReportStatus.PENDING_APPROVAL

    def test_approve_publishes_once_all_required_non_gyne_signers_signed(
        self, db, admin_user, pathologist_user
    ):
        registrar, _ = admin_user
        path1, _ = pathologist_user
        cosigner, _ = _make_user(db, f"ncosign_{uuid.uuid4().hex[:6]}", "CosignPass1!", ["senior_pathologist"])
        case, report = make_pending_nongyne_report(db, registrar.id, path1.id)
        add_nongyne_signer(db, report.id, cosigner.id, "co-signer", None, current_user=path1)
        make_system_setting(db, require_all_non_gyne_sign=True)
        process_nongyne_cosign(db, report.id, cosigner, _req("APPROVE", agreement="agree"))

        result = process_nongyne_report_approval(db, report.id, path1, _req("APPROVE"))

        assert result.status == NongyneReportStatus.PUBLISHED
