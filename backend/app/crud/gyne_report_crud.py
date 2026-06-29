from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.gyne_cyto_report import GyneCytoReport, GyneReportStatus, GyneReportSigner
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.gyne_diagnosis import GyneDiagnosis
from app.models.cyto_approval_log import CytoReportAuditLog
from app.models.user import User
from app.schemas.report_approval import ReportApproveRequest
from datetime import datetime
from app.utils.time import local_now


def process_gyne_report_approval(
    db: Session, report_id: int, current_user: User, req: ReportApproveRequest
):
    db_report = db.query(GyneCytoReport).filter(GyneCytoReport.id == report_id).first()
    if not db_report:
        return None

    action = req.action.upper().strip()
    now = local_now()

    # Note: GyneCytoReport doesn't currently have a separate Log table like Surgical.
    # We could add one, but for now we'll just update the status.
    # If the user wants audit logs for Gyne, we should create a GyneReportApprovalLog table.
    
    if action in ["APPROVE", "APPROVED"]:
        db_report.status = GyneReportStatus.PUBLISHED
        db_report.approved_at = now
        db_report.published_at = now
        db_report.pathologist_name = current_user.report_name or current_user.full_name
        
        # 🚩 Save Agreement Logic
        signer = db.query(GyneReportSigner).filter(
            GyneReportSigner.report_id == report_id,
            GyneReportSigner.user_id == current_user.id
        ).first()

        if not signer:
            # Create if not exists (Auto-assign signer if approver wasn't in the list)
            signer = GyneReportSigner(
                report_id=report_id, 
                user_id=current_user.id, 
                role="primary", 
                assigned_at=now
            )
            db.add(signer)
        
        signer.signed_at = now
        signer.agreement = req.agreement
        signer.agreement_note = req.agreement_note
        
        if db_report.case_id is not None:
            db_case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == db_report.case_id).first()
            if db_case:
                db_case.status = "published"
                db_case.report_at = now

    elif action in ["REJECT", "REQUEST_CHANGES"]:
        db_report.status = GyneReportStatus.DRAFT

        if db_report.case_id is not None:
            db_case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == db_report.case_id).first()
            if db_case:
                db_case.status = "screened"  # Back to screened state for correction
                db_case.is_reported = False

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    log = CytoReportAuditLog(
        report_type="gyne",
        report_id=report_id,
        approver_id=current_user.id,
        approver_name=current_user.report_name or current_user.full_name,
        action=action,
        comment=req.comment,
    )
    db.add(log)
    db.commit()
    db.refresh(db_report)
    return db_report


def process_gyne_cosign(
    db: Session, report_id: int, current_user: User, req: ReportApproveRequest
):
    """Co-signer records signature + opinion without changing report status."""
    signer = (
        db.query(GyneReportSigner)
        .filter(
            GyneReportSigner.report_id == report_id,
            GyneReportSigner.user_id == current_user.id,
            GyneReportSigner.role != "primary",
        )
        .first()
    )
    if not signer:
        raise HTTPException(status_code=403, detail="You are not a co-signer on this report.")

    now = local_now()
    signer.signed_at = now
    signer.agreement = req.agreement
    signer.agreement_note = req.agreement_note

    log = CytoReportAuditLog(
        report_type="gyne",
        report_id=report_id,
        approver_id=current_user.id,
        approver_name=current_user.report_name or current_user.full_name,
        action="COSIGNED",
        comment=req.comment,
    )
    db.add(log)
    db.commit()
    db_report = db.query(GyneCytoReport).filter(GyneCytoReport.id == report_id).first()
    db.refresh(db_report)
    return db_report


def add_gyne_signer(
    db: Session, report_id: int, user_id: int, role: str, consult_note: str | None, current_user: User
):
    """Add a co-signer to a gyne report in pending_approval state."""
    report = db.query(GyneCytoReport).filter(GyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    if report.status != GyneReportStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Report is not pending approval.")

    is_primary = (
        db.query(GyneReportSigner)
        .filter(
            GyneReportSigner.report_id == report_id,
            GyneReportSigner.user_id == current_user.id,
            GyneReportSigner.role == "primary",
        )
        .first()
    )
    if not is_primary:
        raise HTTPException(status_code=403, detail="Only the primary signer can add co-signers.")

    existing = (
        db.query(GyneReportSigner)
        .filter(GyneReportSigner.report_id == report_id, GyneReportSigner.user_id == user_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="User is already a signer.")

    signer = GyneReportSigner(
        report_id=report_id,
        user_id=user_id,
        role=role,
        consult_note=consult_note,
        assigned_at=local_now(),
    )
    db.add(signer)
    db.commit()
    db.refresh(report)
    return report
