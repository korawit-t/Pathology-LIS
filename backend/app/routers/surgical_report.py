from app.schemas.surgical_bulk import BulkSaveDraft
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Literal, Optional
import traceback
import logging

logger = logging.getLogger(__name__)
from datetime import date
from app.utils.time import local_now
import io

from app.db.database import get_db
from app.crud.surgical_report import (
    attach_report_images,
    finalize_and_snapshot_orchestrator,
    get_all_reports_paginated,
    get_reports_paginated,
    get_report,
    get_pending_cosign_worklist,
    resolve_report_logo,
)
from app.crud.surgical_report_builder import prepare_report_data
from app.crud.surgical_statistics import get_surgical_statistics, get_lab_tech_statistics, get_staff_registration_stats, get_staff_gross_stats, get_tissue_process_stats, get_storage_stats, get_outlab_stats
from app.crud.ihc_tat import get_ihc_tat, get_ihc_outstanding
from app.schemas.ihc_tat import IhcTatResponse, IhcOutstandingCase
from app.schemas.surgical_report import (
    SurgicalReportResponse,
    SurgicalReportPagination,
    SurgicalStatResponse,
    LabTechStatResponse,
)
from app.dependencies.auth import InternalStaffOnly, get_current_user, get_scoped_hospital_ids, assert_hospital_scoped_access
from app.models.user import User
from app.crud.system_setting import get_settings as get_system_settings
from app.models.surgical_report import SurgicalReport, ReportStatus
from app.core.roles import CAN_WRITE_REPORT, CAN_READ_REPORT, CAN_READ_IHC_TAT
from app.crud.report_archive import get_surgical_archive
from app.schemas.archive import ArchivePage
from app.dependencies.step_up import require_step_up

# Clinician and hospital accounts reach only the endpoints named here (what
# the results portal calls); see InternalStaffOnly before adding one.
router = APIRouter(
    prefix="/surgical-reports",
    tags=["Surgical Reports"],
    dependencies=[
        Depends(InternalStaffOnly(open_to_external={
            "read_surgical_archive",
            "get_historical_report_pdf",
            "mark_surgical_report_read",
        })),
    ],
)


def _build_barcode_value(case, setting, case_type_code: str) -> tuple[str, str]:
    """
    Build barcode string in aabbxxx format:
      aa = visit type prefix (OPD/IPD from SystemSetting)
      bb = case type code (from SystemSetting)
      xxx = VN (OPD) or AN (IPD)
    Returns (barcode_value, barcode_type_label).
    Falls back to raw VN/AN/accession_no if setting is unavailable.
    """
    vn = (case.vn or "").strip() if case else ""
    an = (case.an or "").strip() if case else ""

    opd_prefix = (setting.barcode_opd_prefix or "2") if setting else "2"
    ipd_prefix = (setting.barcode_ipd_prefix or "3") if setting else "3"
    type_code = case_type_code

    if vn:
        return f"{opd_prefix}{type_code}{vn}", f"OPD VN: {vn}"
    elif an:
        return f"{ipd_prefix}{type_code}{an}", f"IPD AN: {an}"
    else:
        accession = getattr(case, "accession_no", "") or "" if case else ""
        return accession, "Accession No."


@router.get(
    "/statistics",
    response_model=SurgicalStatResponse,
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_surgical_statistics(
    start_date: date = Query(...),
    end_date: date = Query(...),
    pathologist_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    ดึงสถิติของ Surgical Cases 
    (จำนวนเคสทั้งหมด, และค่าเฉลี่ย Turnaround Time)
    """
    return get_surgical_statistics(
        db=db,
        start_date=start_date,
        end_date=end_date,
        pathologist_id=pathologist_id,
    )


@router.get(
    "/staff-registration-stats",
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_staff_registration_stats(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
):
    return get_staff_registration_stats(db=db, start_date=start_date, end_date=end_date)


@router.get(
    "/staff-gross-stats",
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_staff_gross_stats(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
):
    return get_staff_gross_stats(db=db, start_date=start_date, end_date=end_date)


@router.get(
    "/storage-stats",
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_storage_stats(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
):
    return get_storage_stats(db=db, start_date=start_date, end_date=end_date)


@router.get(
    "/tissue-process-stats",
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_tissue_process_stats(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
):
    return get_tissue_process_stats(db=db, start_date=start_date, end_date=end_date)


@router.get(
    "/outlab-stats",
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_outlab_stats(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
):
    return get_outlab_stats(db=db, start_date=start_date, end_date=end_date)


@router.get(
    "/ihc-tat",
    response_model=IhcTatResponse,
    dependencies=[Depends(CAN_READ_IHC_TAT)],
)
def read_ihc_tat(
    start_date: date = Query(...),
    end_date: date = Query(...),
    case_type: Literal["surgical", "nongyne"] = Query("surgical"),
    db: Session = Depends(get_db),
):
    """IHC requests that went out (published) in the period, with their
    order → outlab → signed → published timeline in working days. Also
    serves Report Analytics → Non-Gyne Cyto → IHC TAT (case_type=nongyne)."""
    return get_ihc_tat(db, start_date, end_date, case_type)


@router.get(
    "/ihc-tat/outstanding",
    response_model=List[IhcOutstandingCase],
    dependencies=[Depends(CAN_READ_IHC_TAT)],
)
def read_ihc_outstanding(
    case_type: Literal["surgical", "nongyne"] = Query("surgical"),
    db: Session = Depends(get_db),
):
    """Cases whose IHC hasn't gone out yet, oldest order first."""
    return get_ihc_outstanding(db, case_type)


@router.get(
    "/lab-stats",
    response_model=LabTechStatResponse,
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_lab_tech_statistics(
    start_date: date = Query(...),
    end_date: date = Query(...),
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return get_lab_tech_statistics(db=db, start_date=start_date, end_date=end_date, user_id=user_id)


@router.get(
    "/pending-cosign",
    response_model=SurgicalReportPagination,
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_pending_cosign_worklist(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # 🚩 ต้องมีเพื่อระบุตัวตนหมอ
):
    """
    ดึงรายการเคสที่ User คนนี้ถูกระบุเป็นผู้ลงนามร่วม (Consult/Reviewer)
    แต่ยังไม่ได้กดเซ็นชื่อออกไป (signed_at is None)
    """
    return get_pending_cosign_worklist(
        db, user_id=current_user.id, page=page, size=size, search=search
    )


# 1. สร้าง Snapshot รายงาน (Finalize)
@router.post(
    "/{case_id}/finalize-snapshot",
    response_model=SurgicalReportResponse,  # ใส่ Response Model เพื่อให้ Swagger สวยงาม
    # Signing out a report is not reversible, so it re-checks the second factor
    # even on a browser trusted at login. No-op for users without MFA.
    dependencies=[Depends(CAN_WRITE_REPORT), Depends(require_step_up)],
)
def finalize_and_snapshot_endpoint(
    case_id: int,
    data: BulkSaveDraft,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    บันทึก Draft ล่าสุดและสร้าง Snapshot รายงานทันที (Atomic Transaction)
    """
    try:
        # เรียก Orchestrator ที่เราทำไว้
        report = finalize_and_snapshot_orchestrator(db, case_id, data, current_user.id)
        if not report:
            raise HTTPException(
                status_code=400, detail="ไม่สามารถสร้างรายงานได้ กรุณาตรวจสอบข้อมูลการวินิจฉัย"
            )
        from app.services.notification_service import notify_signed_out
        notify_signed_out(db, {
            "hn": report.patient_hn or "-",
            "name": report.patient_name or "-",
            "accession_no": report.accession_no or "-",
            "id_case": report.accession_no or "-",
            "clinician": report.clinician_name or "-",
        })
        return report
    except Exception:
        logger.error("Finalize & Snapshot Error: %s", traceback.format_exc())
        raise HTTPException(status_code=500, detail="An error occurred while processing the report. Please try again or contact support.")


@router.get(
    "/all",
    response_model=SurgicalReportPagination,
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_all_reports(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = Query(None),
    is_print: Optional[bool] = Query(None),
    unprinted_first: bool = Query(False),
    db: Session = Depends(get_db),
):
    """
    ดึงรายงานทั้งหมดของทุกเคส (หน้า All List)
    """
    return get_all_reports_paginated(
        db,
        page=page,
        size=size,
        search=search,
        status_filter=status,
        is_print=is_print,
        unprinted_first=unprinted_first,
    )


@router.get(
    "/archive",
    response_model=ArchivePage,
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_surgical_archive(
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
    return get_surgical_archive(db, page=page, size=size, search=search, hospital_ids=hospital_ids, clinician=clinician)


# 2. ดึงรายการรายงานทั้งหมดของ Case นั้นๆ (History)
@router.get(
    "/cases/{case_id}",
    response_model=SurgicalReportPagination,  # 🚩 เปลี่ยนจาก List[...] เป็นตัวนี้
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_report_history(
    case_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.surgical_case import SurgicalCase

    case = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()
    assert_hospital_scoped_access(current_user, case.hospital_id if case else None)

    return get_reports_paginated(
        db, case_id=case_id, page=page, size=size, search=search
    )


@router.post("/cases/{case_id}/preview-pdf", dependencies=[Depends(CAN_READ_REPORT)])
def preview_report_pdf(case_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    API สำหรับดึง PDF Preview (ยังไม่บันทึกลง DB)
    payload: { "active_specimen_ids": [1, 2, 3], "is_pending": True, "pending_reason": "Waiting" }
    """
    from app.models.surgical_case import SurgicalCase

    case = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()
    assert_hospital_scoped_access(current_user, case.hospital_id if case else None)

    # 1. ดึงข้อมูลดิบจากฟังก์ชันที่เราทำไว้
    active_ids = payload.get("active_specimen_ids")
    
    # ดึงค่า override จากหน้าบ้าน
    preview_overrides = {
        "is_pending": payload.get("is_pending"),
        "pending_reason": payload.get("pending_reason")
    }
    # ลบ key ที่เป็น None ออกเพื่อให้ fallback ไปใช้ค่าใน DB ถ้าไม่ได้ส่งมา
    preview_overrides = {k: v for k, v in preview_overrides.items() if v is not None}
    
    report_data = prepare_report_data(
        db, 
        case_id, 
        active_specimen_ids=active_ids, 
        preview_overrides=preview_overrides if preview_overrides else None
    )

    if not report_data:
        raise HTTPException(status_code=404, detail="Case not found")

    # 2. ส่งข้อมูลให้ PDF Service เพื่อสร้างไฟล์ Binary
    from app.services.pdf_service import generate_pdf_blob
    from app.services.consult_cover import prepend_consult_covers

    resolve_report_logo(report_data, db)
    sys_settings = get_system_settings(db)
    active_template = f"reports/{sys_settings.surgical_report_template or 'surgical_report_template.html'}"
    pdf_blob = generate_pdf_blob(report_data, template_name=active_template, is_preview=True)
    pdf_blob = prepend_consult_covers(db, pdf_blob, report_data, case_type="surgical", case_id=case_id)

    # 3. ส่งกลับเป็น StreamingResponse เพื่อให้หน้าบ้านเปิดดูได้
    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=preview.pdf"},
    )


@router.post("/cases/{case_id}/preview-data", dependencies=[Depends(CAN_READ_REPORT)])
def preview_report_data_api(case_id: int, payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    ดึงข้อมูล JSON ที่รวมร่างแล้ว (Merge tags แล้ว) มาเช็คบน UI ก่อน Gen PDF
    """
    from app.models.surgical_case import SurgicalCase

    case = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()
    assert_hospital_scoped_access(current_user, case.hospital_id if case else None)

    active_ids = payload.get("active_specimen_ids")
    data = prepare_report_data(db, case_id, active_specimen_ids=active_ids)
    if not data:
        raise HTTPException(status_code=404, detail="Case not found")
    return data


@router.get("/cases/{case_id}/latest/pdf", dependencies=[Depends(CAN_READ_REPORT)])
def get_latest_finalized_report_pdf(
    case_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Return the PDF of the most recently published report for a case."""
    from app.models.surgical_report import SurgicalReport, ReportStatus

    report = (
        db.query(SurgicalReport)
        .filter(
            SurgicalReport.case_id == case_id,
            SurgicalReport.status == ReportStatus.PUBLISHED,
        )
        .order_by(SurgicalReport.published_at.desc())
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="No published report found for this case")
    assert_hospital_scoped_access(current_user, report.hospital_id)

    report_data = {c.name: getattr(report, c.name) for c in report.__table__.columns}
    attach_report_images(db, report, report_data)

    report_data["preview_date"] = local_now().strftime("%d/%m/%Y %H:%M")

    from app.services.pdf_service import generate_pdf_blob
    from app.services.consult_cover import prepend_consult_covers

    resolve_report_logo(report_data, db)
    sys_settings = get_system_settings(db)
    active_template = f"reports/{sys_settings.surgical_report_template or 'surgical_report_template.html'}"
    pdf_blob = generate_pdf_blob(
        report_data,
        template_name=active_template,
        is_preview=False,
    )
    pdf_blob = prepend_consult_covers(db, pdf_blob, report_data, case_type="surgical", case_id=case_id)

    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=report_case_{case_id}.pdf"},
    )


@router.get("/{report_id}/pdf", dependencies=[Depends(CAN_READ_REPORT)])
def get_historical_report_pdf(
    report_id: int,
    with_barcode: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. ดึงข้อมูลจาก DB Snapshot
    report = get_report(db, report_id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)

    # 2. แปลงเป็น Dictionary + รูปของฉบับนี้ (จาก images_snapshot ไม่ใช่รูปสดของเคส)
    report_data = {c.name: getattr(report, c.name) for c in report.__table__.columns}
    attach_report_images(db, report, report_data)

    if with_barcode:
        from app.models.surgical_case import SurgicalCase
        from app.models.system_setting import SystemSetting
        from app.services.barcode_service import (
            generate_report_footer_barcode,
            has_scannable_visit,
        )

        case = db.query(SurgicalCase).filter(SurgicalCase.id == report.case_id).first()
        # _build_barcode_value falls back to the bare accession number for the
        # label sheet's benefit; on the report that is a barcode the HIS cannot
        # resolve, so the footer is left off entirely instead.
        if has_scannable_visit(case):
            setting = db.query(SystemSetting).first()
            type_code = (setting.barcode_surgical_type_code or "08") if setting else "08"

            barcode_value, barcode_type = _build_barcode_value(case, setting, type_code)
            # Footer sizing, and the true mm are carried through to the template
            # so the <img> can be pinned to them. Letting CSS size it instead
            # scaled the symbol to a 0.423mm X-dimension, below what the site's
            # printer can resolve.
            (
                report_data["barcode_svg"],
                report_data["barcode_width_mm"],
                report_data["barcode_height_mm"],
            ) = generate_report_footer_barcode(barcode_value)
            report_data["barcode_value"] = barcode_value
            report_data["barcode_type"] = barcode_type

    # 3. จัดการ Metadata เพิ่มเติม
    is_preview_mode = report.status != "published"
    report_data["preview_date"] = local_now().strftime("%d/%m/%Y %H:%M")

    # 4. ส่งให้ PDF Service
    from app.services.pdf_service import generate_pdf_blob
    from app.services.consult_cover import prepend_consult_covers

    resolve_report_logo(report_data, db)
    sys_settings = get_system_settings(db)
    active_template = f"reports/{sys_settings.surgical_report_template or 'surgical_report_template.html'}"
    pdf_blob = generate_pdf_blob(report_data, template_name=active_template, is_preview=is_preview_mode)
    pdf_blob = prepend_consult_covers(
        db, pdf_blob, report_data, case_type="surgical", case_id=report.case_id
    )

    return StreamingResponse(
        io.BytesIO(pdf_blob),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=report_{report_id}.pdf"},
    )


@router.get(
    "/{report_id}",
    response_model=SurgicalReportResponse,
    dependencies=[Depends(CAN_READ_REPORT)],
)
def read_report_by_id(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    ดึงข้อมูลรายงานฉบับเดียวด้วย report_id
    """
    report = get_report(db, report_id=report_id)  # เรียกฟังก์ชันใน CRUD
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found"
        )
    assert_hospital_scoped_access(current_user, report.hospital_id)
    return report


@router.delete("/{report_id}", dependencies=[Depends(CAN_WRITE_REPORT)])
def delete_report(report_id: int, db: Session = Depends(get_db)):
    """
    ลบรายงานที่ยังเป็นสถานะ draft เท่านั้น (เช่น draft addendum ที่ยังไม่ต้องการทำต่อ)
    """
    report = get_report(db, report_id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.status != ReportStatus.DRAFT.value:
        raise HTTPException(
            status_code=400, detail="Only draft reports can be deleted"
        )
    db.delete(report)
    db.commit()
    return {"message": "Draft report deleted successfully"}


@router.patch("/{report_id}/print-status", dependencies=[Depends(CAN_READ_REPORT)])
def update_print_status(report_id: int, payload: dict, db: Session = Depends(get_db)):
    """
    อัปเดตสถานะการพิมพ์ PDF (is_print)
    payload: {"is_print": true}
    """
    report = get_report(db, report_id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    is_print = payload.get("is_print", True)
    report.is_print = is_print
    db.commit()
    db.refresh(report)
    
    return {"message": "Print status updated successfully", "is_print": report.is_print}


@router.post("/barcode-pdf", dependencies=[Depends(CAN_READ_REPORT)])
def generate_barcode_label_pdf(payload: dict, db: Session = Depends(get_db)):
    """
    สร้าง PDF ที่มี Code 39 barcode สำหรับ Report ที่เลือก
    payload: {"report_ids": [1, 2, 3]}
    barcode จะใช้ค่า VN หรือ AN จาก SurgicalCase ต้นทาง
    """
    from app.models.surgical_case import SurgicalCase
    from app.models.system_setting import SystemSetting
    from app.services.barcode_service import generate_code39_base64_img
    from app.services.pdf_service import generate_pdf_blob

    report_ids = payload.get("report_ids", [])
    if not report_ids:
        raise HTTPException(status_code=400, detail="report_ids is required")

    setting = db.query(SystemSetting).first()
    type_code = (setting.barcode_surgical_type_code or "08") if setting else "08"

    labels = []
    for rid in report_ids:
        report = get_report(db, report_id=rid)
        if not report:
            continue

        case = db.query(SurgicalCase).filter(SurgicalCase.id == report.case_id).first()
        barcode_value, barcode_type = _build_barcode_value(case, setting, type_code)
        barcode_svg, barcode_width_mm, barcode_height_mm = generate_code39_base64_img(barcode_value)

        labels.append({
            "accession_no": report.accession_no,
            "patient_title": report.patient_title or "",
            "patient_name": report.patient_name,
            "patient_ln": report.patient_ln or "",
            "patient_hn": report.patient_hn,
            "patient_age": report.patient_age,
            "patient_age_display": report.patient_age_display or str(report.patient_age),
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
        headers={"Content-Disposition": "inline; filename=barcode_labels.pdf"},
    )


@router.post("/{report_id}/mark-read")
def mark_surgical_report_read(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = db.query(SurgicalReport).filter(SurgicalReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)
    if not report.is_read:
        report.is_read = True
        report.read_at = local_now()
        db.commit()
    return {"success": True, "report_id": report_id}
