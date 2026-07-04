import io
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.crud.gyne_cyto_report import (
    publish_gyne_report,
    complete_gyne_review,
    get_reports_by_case,
    get_report_by_id,
    prepare_gyne_report_data,
    get_all_reports,
    get_pending_cosign_worklist_gyne,
)
from app.schemas.gyne_cyto_report import (
    GyneCytoReportResponse,
    GyneCytoReportPagination,
    GyneReportSignerCreate
)
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.gyne_cyto_report import GyneCytoReport
from app.core.roles import (
    CAN_WRITE_GYNE_CYTO_REPORT,
    CAN_READ_GYNE_CYTO_REPORT
)
from app.dependencies.auth import get_current_user, RoleChecker
from pydantic import BaseModel
from datetime import datetime
from app.utils.time import local_now
from app.crud.report_archive import get_gyne_archive
from app.schemas.archive import ArchivePage

router = APIRouter(
    prefix="/gyne-cyto-reports",
    tags=["Gyne Cyto Reports"],
    dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)],
)

class PublishReportRequest(BaseModel):
    signers: Optional[List[GyneReportSignerCreate]] = None
    is_abnormal: bool = False
    is_out_lab_consult: Optional[bool] = None
    consult_reason: Optional[str] = None


@router.get(
    "",
    response_model=GyneCytoReportPagination,
    dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)]
)
def read_all_reports(
    skip: int = 0,
    limit: int = 20,
    search: str = None,
    status: Optional[str] = None,
    is_print: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """ดึงรายงานทั้งหมด (Pagination)"""
    return get_all_reports(db, skip=skip, limit=limit, search=search, status=status, is_print=is_print)


@router.get(
    "/archive",
    response_model=ArchivePage,
)
def read_gyne_archive(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    hospital_id: Optional[int] = Query(None),
    clinician: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return get_gyne_archive(db, page=page, size=size, search=search, hospital_id=hospital_id, clinician=clinician)


@router.post(
    "/{case_id}/publish",
    response_model=GyneCytoReportResponse,
    dependencies=[Depends(CAN_WRITE_GYNE_CYTO_REPORT)]
)
def publish_report(
    case_id: int, 
    payload: PublishReportRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """สร้างและเผยแพร่รายงาน (Snapshot) ทันที"""
    signers_data = [s.model_dump() for s in payload.signers] if payload.signers else None
    result = publish_gyne_report(
        db,
        case_id=case_id,
        signers=signers_data,
        current_user_id=current_user.id,
        is_abnormal=payload.is_abnormal,
        is_out_lab_consult=payload.is_out_lab_consult,
        consult_reason=payload.consult_reason,
    )
    from app.services.notification_service import notify_signed_out
    notify_signed_out(db, {
        "hn": result.patient_hn or "-",
        "name": result.patient_name or "-",
        "accession_no": result.accession_no or "-",
        "id_case": result.accession_no or "-",
        "clinician": result.clinician_name or "-",
    })
    return result


@router.get(
    "/cases/{case_id}",
    response_model=List[GyneCytoReportResponse],
    dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)]
)
def read_report_history(case_id: int, db: Session = Depends(get_db)):
    """ดึงประวัติรายงานของเคส"""
    return get_reports_by_case(db, case_id=case_id)


@router.get(
    "/pending-cosign",
    response_model=GyneCytoReportPagination,
    dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)],
)
def read_pending_cosign_worklist_gyne(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_pending_cosign_worklist_gyne(
        db, user_id=current_user.id, page=page, size=size, search=search
    )


@router.get(
    "/{report_id}",
    response_model=GyneCytoReportResponse,
    dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)]
)
def read_report(report_id: int, db: Session = Depends(get_db)):
    """ดึงข้อมูลรายงานฉบับเดียว"""
    report = get_report_by_id(db, report_id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


class CompleteReviewRequest(BaseModel):
    review_result: str = "agree"   # "agree" | "disagree"
    review_note: Optional[str] = None
    discrepancy_level: Optional[str] = None  # "minor" | "major"
    is_out_lab_consult: Optional[bool] = None
    consult_reason: Optional[str] = None


@router.post(
    "/cases/{case_id}/complete-review",
    dependencies=[Depends(CAN_WRITE_GYNE_CYTO_REPORT)]
)
def complete_review(
    case_id: int,
    payload: CompleteReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pathologist completes QC review (agree/disagree) → advances case to pending_approval"""
    return complete_gyne_review(
        db,
        case_id=case_id,
        reviewer_id=current_user.id,
        review_result=payload.review_result,
        review_note=payload.review_note,
        discrepancy_level=payload.discrepancy_level,
        is_out_lab_consult=payload.is_out_lab_consult,
        consult_reason=payload.consult_reason,
    )


@router.post("/cases/{case_id}/preview-data", dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)])
def preview_report_data(case_id: int, db: Session = Depends(get_db)):
    """ดูข้อมูลที่จะใช้ในรายงานก่อน Publish"""
    data = prepare_gyne_report_data(db, case_id)
    if not data:
        raise HTTPException(status_code=404, detail="Case or Diagnosis not found")
    return data
from fastapi.responses import StreamingResponse

@router.get("/{report_id}/pdf", dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)])
def get_report_pdf(report_id: int, db: Session = Depends(get_db)):
    """ดาวน์โหลดรายงาน PDF"""
    report = get_report_by_id(db, report_id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Outlab case: serve uploaded PDF directly
    from app.models.gyne_cyto_case import GyneCytologyCase
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == report.case_id).first()
    if case and case.outlab_report_pdf_path:
        if not os.path.exists(case.outlab_report_pdf_path):
            raise HTTPException(status_code=404, detail="Outlab report file not found on server.")
        return FileResponse(
            path=case.outlab_report_pdf_path,
            filename=f"{report.accession_no}_outlab.pdf",
            media_type="application/pdf",
        )

    from app.crud.gyne_cyto_report import get_gyne_report_pdf
    pdf_blob = get_gyne_report_pdf(db, case_id=report.case_id, is_preview=False, report_id=report_id)

    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=report_{report.accession_no}.pdf"}
    )


@router.get("/cases/{case_id}/preview-pdf", dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)])
def preview_report_pdf(case_id: int, db: Session = Depends(get_db)):
    """พรีวิวรายงาน PDF ก่อนส่งผล"""
    from app.crud.gyne_cyto_report import get_gyne_report_pdf
    pdf_blob = get_gyne_report_pdf(db, case_id=case_id, is_preview=True)
    if not pdf_blob:
        raise HTTPException(status_code=404, detail="Case or Diagnosis not found")
        
    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf"
    )


@router.patch("/{report_id}/print-status", dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)])
def update_gyne_print_status(report_id: int, payload: dict, db: Session = Depends(get_db)):
    report = db.query(GyneCytoReport).filter(GyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.is_print = payload.get("is_print", True)
    db.commit()
    db.refresh(report)
    return {"message": "Print status updated successfully", "is_print": report.is_print}


@router.post("/barcode-pdf", dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)])
def generate_gyne_barcode_pdf(payload: dict, db: Session = Depends(get_db)):
    from app.models.gyne_cyto_case import GyneCytologyCase
    from app.models.system_setting import SystemSetting
    from app.services.barcode_service import generate_code39_base64_img
    from app.services.pdf_service import generate_pdf_blob

    report_ids = payload.get("report_ids", [])
    if not report_ids:
        raise HTTPException(status_code=400, detail="report_ids is required")

    setting = db.query(SystemSetting).first()
    type_code = (setting.barcode_gyne_type_code or "09") if setting else "09"
    opd_prefix = (setting.barcode_opd_prefix or "2") if setting else "2"

    labels = []
    for rid in report_ids:
        report = db.query(GyneCytoReport).filter(GyneCytoReport.id == rid).first()
        if not report:
            continue
        barcode_value = f"{opd_prefix}{type_code}{report.patient_hn or report.accession_no}"
        barcode_svg = generate_code39_base64_img(barcode_value)
        labels.append({
            "accession_no": report.accession_no,
            "patient_title": report.patient_title or "",
            "patient_name": report.patient_name,
            "patient_ln": report.patient_ln or "",
            "patient_hn": report.patient_hn,
            "patient_age": report.patient_age,
            "patient_age_display": str(report.patient_age) if report.patient_age else "-",
            "patient_gender": report.patient_gender,
            "hospital_name": report.hospital_name,
            "barcode_svg": barcode_svg,
            "barcode_value": barcode_value,
            "barcode_type": f"Gyne HN: {report.patient_hn}",
        })

    if not labels:
        raise HTTPException(status_code=404, detail="No valid reports found")

    pdf_blob = generate_pdf_blob(
        {"labels": labels},
        template_name="reports/barcode_label_template.html",
    )
    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=gyne_barcode_labels.pdf"},
    )


@router.post("/{report_id}/mark-read", dependencies=[Depends(get_current_user)])
def mark_gyne_report_read(report_id: int, db: Session = Depends(get_db)):
    report = db.query(GyneCytoReport).filter(GyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.is_read:
        report.is_read = True
        report.read_at = local_now()
        db.commit()
    return {"success": True, "report_id": report_id}
