from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.utils.time import local_now
import io

from app.db.database import get_db
from app.crud.system_setting import get_settings as get_system_settings
from app.crud.nongyne_cyto_report import (
    publish_nongyne_report,
    get_reports_by_case,
    get_report_by_id,
    prepare_nongyne_report_data,
    prepare_nongyne_report_pdf_data,
    get_nongyne_snapshot_pdf_data,
    get_all_reports,
    get_pending_cosign_worklist_nongyne,
)
from app.schemas.nongyne_cyto_report import (
    NongyneCytoReportResponse,
    NongyneCytoReportPagination,
    NongyneReportSignerCreate,
)
from app.dependencies.auth import get_current_user, get_scoped_hospital_ids, assert_hospital_scoped_access
from app.models.user import User
from app.models.nongyne_cyto_report import NongyneCytoReport
from app.core.roles import CAN_WRITE_NONGYNE_CYTO_REPORT, CAN_READ_NONGYNE_CYTO_REPORT
from pydantic import BaseModel
from app.crud.report_archive import get_nongyne_archive
from app.schemas.archive import ArchivePage

router = APIRouter(
    prefix="/nongyne-cyto-reports",
    tags=["Nongyne Cyto Reports"],
    dependencies=[Depends(CAN_READ_NONGYNE_CYTO_REPORT)],
)


class PublishReportRequest(BaseModel):
    signers: Optional[List[NongyneReportSignerCreate]] = None
    is_pending: bool = False
    pending_reason: Optional[str] = None
    is_out_lab_consult: Optional[bool] = None
    consult_reason: Optional[str] = None


@router.get("", response_model=NongyneCytoReportPagination)
def read_all_reports(
    skip: int = 0,
    limit: int = 20,
    search: str = None,
    status: Optional[str] = None,
    is_print: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    return get_all_reports(db, skip=skip, limit=limit, search=search, status=status, is_print=is_print)


@router.get("/archive", response_model=ArchivePage)
def read_nongyne_archive(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    hospital_id: Optional[int] = Query(None),
    clinician: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_hospital_ids = get_scoped_hospital_ids(current_user)
    if allowed_hospital_ids is not None:
        if hospital_id is not None and hospital_id not in allowed_hospital_ids:
            raise HTTPException(status_code=403, detail="Access denied.")
        hospital_ids = [hospital_id] if hospital_id is not None else list(allowed_hospital_ids)
    else:
        hospital_ids = [hospital_id] if hospital_id is not None else None
    return get_nongyne_archive(db, page=page, size=size, search=search, hospital_ids=hospital_ids, clinician=clinician)


@router.post(
    "/{case_id}/publish",
    response_model=NongyneCytoReportResponse,
    dependencies=[Depends(CAN_WRITE_NONGYNE_CYTO_REPORT)],
)
def publish_report(
    case_id: int,
    payload: PublishReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    signers_data = [s.model_dump() for s in payload.signers] if payload.signers else None
    result = publish_nongyne_report(
        db,
        case_id=case_id,
        signers=signers_data,
        current_user_id=current_user.id,
        is_pending=payload.is_pending,
        pending_reason=payload.pending_reason,
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


@router.get("/cases/{case_id}", response_model=List[NongyneCytoReportResponse])
def read_report_history(case_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.nongyne_cyto_case import NongyneCytologyCase

    case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()
    assert_hospital_scoped_access(current_user, case.hospital_id if case else None)

    return get_reports_by_case(db, case_id=case_id)


@router.get("/pending-cosign", response_model=NongyneCytoReportPagination)
def read_pending_cosign_worklist_nongyne(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_pending_cosign_worklist_nongyne(
        db, user_id=current_user.id, page=page, size=size, search=search
    )


@router.get("/{report_id}", response_model=NongyneCytoReportResponse)
def read_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = get_report_by_id(db, report_id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)
    return report


@router.post("/cases/{case_id}/preview-data")
def preview_report_data(case_id: int, db: Session = Depends(get_db)):
    data = prepare_nongyne_report_data(db, case_id)
    if not data:
        raise HTTPException(status_code=404, detail="Case or Diagnosis not found")
    return data


@router.get("/cases/{case_id}/preview-pdf")
def preview_report_pdf(
    case_id: int,
    db: Session = Depends(get_db),
    is_pending: bool = False,
    pending_reason: Optional[str] = None,
):
    data = prepare_nongyne_report_pdf_data(db, case_id)
    if not data:
        raise HTTPException(status_code=404, detail="Case or Diagnosis not found")

    if not data.get("is_draft"):
        data["is_pending"] = is_pending
        data["pending_reason"] = pending_reason if is_pending else None

    from app.services import pdf_service
    pdf_blob = pdf_service.generate_pdf_blob(
        data,
        template_name=f"reports/{get_system_settings(db).nongyne_report_template or 'nongyne_cyto_report_template.html'}",
        is_preview=True,
    )
    return StreamingResponse(io.BytesIO(pdf_blob), media_type="application/pdf")


@router.get("/{report_id}/pdf")
def get_report_pdf(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = get_report_by_id(db, report_id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)

    data = get_nongyne_snapshot_pdf_data(db, report)

    from app.services import pdf_service
    pdf_blob = pdf_service.generate_pdf_blob(
        data,
        template_name=f"reports/{get_system_settings(db).nongyne_report_template or 'nongyne_cyto_report_template.html'}",
        is_preview=False,
    )
    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=report_{report.accession_no}.pdf"},
    )


@router.patch("/{report_id}/print-status", dependencies=[Depends(CAN_READ_NONGYNE_CYTO_REPORT)])
def update_nongyne_print_status(report_id: int, payload: dict, db: Session = Depends(get_db)):
    report = db.query(NongyneCytoReport).filter(NongyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.is_print = payload.get("is_print", True)
    db.commit()
    db.refresh(report)
    return {"message": "Print status updated successfully", "is_print": report.is_print}


@router.post("/barcode-pdf", dependencies=[Depends(CAN_READ_NONGYNE_CYTO_REPORT)])
def generate_nongyne_barcode_pdf(payload: dict, db: Session = Depends(get_db)):
    from app.models.nongyne_cyto_case import NongyneCytologyCase
    from app.models.system_setting import SystemSetting
    from app.services.barcode_service import generate_code39_base64_img
    from app.services.pdf_service import generate_pdf_blob

    report_ids = payload.get("report_ids", [])
    if not report_ids:
        raise HTTPException(status_code=400, detail="report_ids is required")

    setting = db.query(SystemSetting).first()
    type_code = (setting.barcode_nongyne_type_code or "10") if setting else "10"
    opd_prefix = (setting.barcode_opd_prefix or "2") if setting else "2"
    ipd_prefix = (setting.barcode_ipd_prefix or "3") if setting else "3"

    labels = []
    for rid in report_ids:
        report = db.query(NongyneCytoReport).filter(NongyneCytoReport.id == rid).first()
        if not report:
            continue
        case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == report.case_id).first()
        vn = (case.vn or "").strip() if case else ""
        an = (case.an or "").strip() if case else ""
        if vn:
            barcode_value = f"{opd_prefix}{type_code}{vn}"
            barcode_type = f"OPD VN: {vn}"
        elif an:
            barcode_value = f"{ipd_prefix}{type_code}{an}"
            barcode_type = f"IPD AN: {an}"
        else:
            barcode_value = report.accession_no or report.patient_hn or ""
            barcode_type = "Accession No."
        barcode_svg, barcode_width_mm, barcode_height_mm = generate_code39_base64_img(barcode_value)
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
            "barcode_type": barcode_type,
            "barcode_width_mm": barcode_width_mm,
            "barcode_height_mm": barcode_height_mm,
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
        headers={"Content-Disposition": "inline; filename=nongyne_barcode_labels.pdf"},
    )


@router.post("/{report_id}/mark-read", dependencies=[Depends(get_current_user)])
def mark_nongyne_report_read(report_id: int, db: Session = Depends(get_db)):
    report = db.query(NongyneCytoReport).filter(NongyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.is_read:
        report.is_read = True
        report.read_at = local_now()
        db.commit()
    return {"success": True, "report_id": report_id}
