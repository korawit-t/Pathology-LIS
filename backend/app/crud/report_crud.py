from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.surgical_report import (
    SurgicalReport,
    ReportStatus,
    ReportApprovalLog,
    ReportSigner,
)  # 🚩 เพิ่ม ReportSigner
from app.schemas.report_approval import ReportApproveRequest
from app.models.user import User
from datetime import datetime
from app.utils.time import local_now
from app.models.surgical_case import SurgicalCase
from app.models.surgical_diagnosis import (
    SurgicalDiagnosis,
)
from app.enums.case_status import CaseStatus


def process_report_approval(
    db: Session, report_id: int, current_user: User, req: ReportApproveRequest
):
    db_report = db.query(SurgicalReport).filter(SurgicalReport.id == report_id).first()
    if not db_report:
        return None

    action = req.action.upper().strip()
    now = local_now()

    # 1. บันทึก Log
    approval_log = ReportApprovalLog(
        report_id=report_id,
        approver_id=current_user.id,
        approver_name=current_user.report_name or current_user.full_name,
        action=action,
        comment=req.comment,
    )
    db.add(approval_log)

    # Record agreement on the signer row (if current user is a co-signer)
    existing_signer = (
        db.query(ReportSigner)
        .filter(
            ReportSigner.report_id == report_id,
            ReportSigner.user_id == current_user.id,
        )
        .first()
    )
    if existing_signer:
        existing_signer.agreement = req.agreement
        existing_signer.agreement_note = req.agreement_note

    if action in ["APPROVE", "APPROVED"]:
        db_report.status = ReportStatus.PUBLISHED
        db_report.approved_at = now
        db_report.published_at = now
        db_report.approver_name_snapshot = (
            current_user.report_name or current_user.full_name
        )

        if db_report.case_id is not None:
            db.query(SurgicalDiagnosis).filter(
                SurgicalDiagnosis.case_id == db_report.case_id,
                SurgicalDiagnosis.status == "draft",
            ).update({"status": "signed", "diagnosis_at": now})

            db_case = db.query(SurgicalCase).filter(SurgicalCase.id == db_report.case_id).first()
            if db_case:
                db_case.status = CaseStatus.SIGNED_OUT.value
                db_case.is_reported = True
                db_case.report_at = now

    elif action in ["REJECT", "REQUEST_CHANGES"]:
        db_report.status = ReportStatus.DRAFT
        # หมายเหตุ: Model SurgicalReport ควรมีฟิลด์ comment หรือเก็บไว้ใน Log

        db_case = (
            db.query(SurgicalCase).filter(SurgicalCase.id == db_report.case_id).first()
        )
        if db_case:
            db_case.is_reported = False
            # 🚩 ถอยสถานะกลับไปเป็น grossing/processing/working
            # (หรือรักษาตาม is_slide_prepped เป็นหลัก)
            if db_case.is_slide_prepped:
                db_case.status = CaseStatus.STAINED.value # กลับมาดู/ซ่อมที่หน้าสไลด์
            else:
                db_case.status = CaseStatus.GROSSED.value

            # ปรับ Diagnosis กลับเป็น Draft
            db.query(SurgicalDiagnosis).filter(
                SurgicalDiagnosis.case_id == db_report.case_id,
                SurgicalDiagnosis.status == "signed",
            ).update({"status": "draft", "diagnosis_at": None})

            # 🚩 จุดสำคัญ: ล้างการเซ็นในตาราง ReportSigner ของ Report ฉบับนี้
            # เพื่อให้หมอทุกคนต้องกลับมาเซ็นชื่อใหม่หลังจากแก้ไขผลแล้ว
            db.query(ReportSigner).filter(ReportSigner.report_id == report_id).update(
                {"signed_at": None}
            )

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    db.commit()
    db.refresh(db_report)
    return db_report


def process_cosign(
    db: Session, report_id: int, current_user: User, req: "ReportApproveRequest"
):
    """Co-signer records their signature + opinion without changing report status."""
    signer = (
        db.query(ReportSigner)
        .filter(
            ReportSigner.report_id == report_id,
            ReportSigner.user_id == current_user.id,
            ReportSigner.role != "primary",
        )
        .first()
    )
    if not signer:
        raise HTTPException(status_code=403, detail="You are not a co-signer on this report.")

    now = local_now()
    signer.signed_at = now
    signer.agreement = req.agreement
    signer.agreement_note = req.agreement_note

    log = ReportApprovalLog(
        report_id=report_id,
        approver_id=current_user.id,
        approver_name=current_user.report_name or current_user.full_name,
        action="COSIGNED",
        comment=req.comment,
    )
    db.add(log)
    db.commit()

    return db.query(SurgicalReport).filter(SurgicalReport.id == report_id).first()


def add_signer_to_report(
    db: Session, report_id: int, user_id: int, role: str, consult_note: str | None, current_user: User
):
    """Add a co-signer to a report that is already in pending_approval state."""
    report = db.query(SurgicalReport).filter(SurgicalReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    if report.status != ReportStatus.PENDING_APPROVAL:
        raise HTTPException(status_code=400, detail="Report is not pending approval.")

    is_primary = (
        db.query(ReportSigner)
        .filter(
            ReportSigner.report_id == report_id,
            ReportSigner.user_id == current_user.id,
            ReportSigner.role == "primary",
        )
        .first()
    )
    if not is_primary:
        raise HTTPException(status_code=403, detail="Only the primary signer can add co-signers.")

    existing = (
        db.query(ReportSigner)
        .filter(ReportSigner.report_id == report_id, ReportSigner.user_id == user_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="User is already a signer on this report.")

    signer = ReportSigner(
        report_id=report_id,
        user_id=user_id,
        role=role,
        consult_note=consult_note,
        diagnosis_order=report.version_no or 1,
        assigned_at=local_now(),
    )
    db.add(signer)
    db.commit()
    db.refresh(report)
    return report
