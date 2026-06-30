import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from app.utils.file_handler import validate_and_sanitize
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Any, Optional
from datetime import datetime, date, time

from app.db.database import get_db
from app.schemas.gyne_cyto_case import (
    GyneCytologyCaseCreate,
    GyneCytologyCaseUpdate,
    GyneCytologyCaseResponse,
    GyneCytologyListResponse,
)
from app.crud import gyne_cyto_case as crud
from app.dependencies.auth import get_current_user
from app.models.gyne_cyto_request_file import GyneCytoRequestFile
from app.models.gyne_cyto_case import GyneCytologyCase

GYNE_UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "requests")
os.makedirs(GYNE_UPLOAD_DIR, exist_ok=True)
OUTLAB_REPORT_DIR = os.path.join(os.getcwd(), "uploads", "outlab")
os.makedirs(OUTLAB_REPORT_DIR, exist_ok=True)

router = APIRouter(prefix="/gyne-cytology", tags=["Gyne Cytology"])


@router.post(
    "",
    response_model=GyneCytologyCaseResponse,  # 🚩 ปรับชื่อ Schema
    status_code=status.HTTP_201_CREATED,
)
def create_case(
    case_in: GyneCytologyCaseCreate,
    db: Session = Depends(get_db),
    # 🚩 แก้จาก Depends(deps.get_current_user) เป็น Depends(get_current_user)
    current_user: Any = Depends(get_current_user),
):
    """
    สร้างเคส Gyne Cytology ใหม่ (ระบบจะรัน Accession No. และบันทึกผู้ลงทะเบียนอัตโนมัติ)
    """
    return crud.create_gyne_case(db=db, obj_in=case_in, registrar_id=current_user.id)


@router.get("", response_model=GyneCytologyListResponse)
def read_cases(
    skip: int = 0,
    limit: int = 20,
    search: str = None,
    status: str = None,
    assigned_to_me: bool = False,
    assigned_user_id: Optional[int] = Query(None),
    hospital_id: Optional[int] = Query(None),
    is_out_lab_consult: bool = None,
    is_out_lab: bool = None,
    consult_status: str = None,
    is_reported: bool = None,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    review_reason: Optional[str] = Query(None),
    signer_id: Optional[int] = Query(None),
    exclude_signed_by: Optional[int] = Query(None),
    signed_by: Optional[int] = Query(None),
    is_reviewed: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    resolved_user_id = current_user.id if assigned_to_me else assigned_user_id

    return crud.get_gyne_cases(
        db=db,
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        assigned_user_id=resolved_user_id,
        signer_id=signer_id,
        exclude_signed_by=exclude_signed_by,
        signed_by=signed_by,
        is_reviewed=is_reviewed,
        hospital_id=hospital_id,
        is_out_lab_consult=is_out_lab_consult,
        is_out_lab=is_out_lab,
        consult_status=consult_status,
        is_reported=is_reported,
        date_from=datetime.combine(date_from, time.min) if date_from else None,
        date_to=datetime.combine(date_to, time.max) if date_to else None,
        review_reason=review_reason,
    )


@router.get("/statistics")
def read_gyne_statistics(
    start_date: str,
    end_date: str,
    pathologist_id: int = None,
    cytotechnologist_id: int = None,
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)
    return crud.get_gyne_statistics(db, start, end, pathologist_id, cytotechnologist_id)


@router.get("/summary-table")
def read_gyne_summary_table(
    start_date: str,
    end_date: str,
    pathologist_id: int = None,
    cytotechnologist_id: int = None,
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)
    return crud.get_gyne_summary_table(db, start, end, pathologist_id, cytotechnologist_id)


@router.get("/slide-quality-stats")
def read_gyne_slide_quality_stats(
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)
    return crud.get_gyne_slide_quality_stats(db, start, end)


@router.get("/qc-statistics")
def read_gyne_qc_statistics(
    start_date: str,
    end_date: str,
    pathologist_id: int = None,
    cytotechnologist_id: int = None,
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)
    return crud.get_gyne_qc_statistics(db, start, end, pathologist_id, cytotechnologist_id)


@router.get("/qc-cases")
def read_gyne_qc_cases(
    start_date: str,
    end_date: str,
    review_reason: str = None,
    pathologist_id: int = None,
    cytotechnologist_id: int = None,
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)
    return crud.get_gyne_qc_case_list(db, start, end, review_reason, pathologist_id, cytotechnologist_id)


@router.get("/tat-stats")
def get_gyne_tat_stats(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    from collections import defaultdict
    from app.models.system_setting import SystemSetting

    setting = db.query(SystemSetting).first()
    target_days = (setting.gyne_tat_days if setting else None) or 5
    express_target_days = (setting.gyne_express_tat_days if setting else None) or 3

    filters = [
        GyneCytologyCase.report_at.isnot(None),
        GyneCytologyCase.registered_at.isnot(None),
    ]
    if date_from:
        filters.append(GyneCytologyCase.registered_at >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(GyneCytologyCase.registered_at <= datetime.combine(date_to, time.max))

    cases = (
        db.query(
            GyneCytologyCase.id,
            GyneCytologyCase.registered_at,
            GyneCytologyCase.report_at,
            GyneCytologyCase.is_express,
        )
        .filter(*filters)
        .all()
    )

    empty = {
        "avg_tat_days": 0,
        "routine_avg_days": 0,
        "express_avg_days": 0,
        "total_reported": 0,
        "on_time_count": 0,
        "on_time_pct": 0,
        "target_days": target_days,
        "express_target_days": express_target_days,
        "distribution": {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0},
        "monthly": [],
    }
    if not cases:
        return empty

    monthly_map: dict = defaultdict(lambda: {"count": 0, "total_days": 0.0})
    dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
    routine_total, routine_n = 0.0, 0
    express_total, express_n = 0.0, 0
    on_time_count = 0

    for c in cases:
        tat = (c.report_at - c.registered_at).total_seconds() / 86400
        month_key = c.registered_at.strftime("%Y-%m")
        monthly_map[month_key]["count"] += 1
        monthly_map[month_key]["total_days"] += tat
        t = express_target_days if c.is_express else target_days
        if tat <= t:
            on_time_count += 1
        if c.is_express:
            express_total += tat; express_n += 1
        else:
            routine_total += tat; routine_n += 1
        if tat < 3: dist["lt3"] += 1
        elif tat < 5: dist["t3_5"] += 1
        elif tat <= 10: dist["t5_10"] += 1
        else: dist["gt10"] += 1

    total_n = len(cases)
    grand_total = routine_total + express_total
    monthly = sorted(
        [{"month": k, "case_count": v["count"], "avg_days": round(v["total_days"] / v["count"], 1)}
         for k, v in monthly_map.items()],
        key=lambda x: x["month"],
    )
    return {
        "avg_tat_days": round(grand_total / total_n, 1),
        "routine_avg_days": round(routine_total / routine_n, 1) if routine_n else 0,
        "express_avg_days": round(express_total / express_n, 1) if express_n else 0,
        "total_reported": total_n,
        "on_time_count": on_time_count,
        "on_time_pct": round(on_time_count / total_n * 100, 1),
        "target_days": target_days,
        "express_target_days": express_target_days,
        "distribution": dist,
        "monthly": monthly,
    }


@router.get("/{case_id}", response_model=GyneCytologyCaseResponse)
def read_case(case_id: int, db: Session = Depends(get_db)):
    db_case = crud.get_gyne_case(db, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบข้อมูลเคส")
    return db_case


@router.patch("/{case_id}", response_model=GyneCytologyCaseResponse)  # 🚩 ปรับชื่อ Schema
def update_case_info(
    case_id: int, case_in: GyneCytologyCaseUpdate, db: Session = Depends(get_db)
):
    db_case = crud.get_gyne_case(db, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    return crud.update_gyne_case(db=db, db_obj=db_case, obj_in=case_in)


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(case_id: int, db: Session = Depends(get_db)):
    success = crud.delete_gyne_case(db=db, case_id=case_id)
    if not success:
        raise HTTPException(
            status_code=404, detail="Case not found or cannot be deleted"
        )
    return None


@router.post("/{case_id}/request-files", response_model=None)
async def upload_request_file(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Validate magic bytes, enforce 30 MB cap, strip EXIF for images
    data, ext = validate_and_sanitize(file, allowed="mixed")

    unique_filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(GYNE_UPLOAD_DIR, unique_filename)
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    record = GyneCytoRequestFile(
        case_id=case_id,
        file_path=file_path,
        file_name=file.filename,
        file_type=file.content_type,
        uploaded_by_id=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"message": "File uploaded successfully", "file_id": record.id}


@router.get("/request-files/{file_id}")
def download_request_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    req_file = db.query(GyneCytoRequestFile).filter(GyneCytoRequestFile.id == file_id).first()
    if not req_file:
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.exists(req_file.file_path):
        raise HTTPException(status_code=404, detail="Physical file not found on server")
    return FileResponse(path=req_file.file_path, filename=req_file.file_name, media_type=req_file.file_type)


@router.delete("/request-files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    req_file = db.query(GyneCytoRequestFile).filter(GyneCytoRequestFile.id == file_id).first()
    if not req_file:
        raise HTTPException(status_code=404, detail="File not found")
    if os.path.exists(req_file.file_path):
        os.remove(req_file.file_path)
    db.delete(req_file)
    db.commit()
    return None


@router.post("/{case_id}/outlab-test-result", response_model=GyneCytologyCaseResponse)
async def upload_outlab_test_result(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    case = crud.get_gyne_case(db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if not case.is_out_lab:
        raise HTTPException(status_code=400, detail="This case is not flagged as an outlab test.")

    data, ext = validate_and_sanitize(file, allowed="pdf")

    if case.out_lab_result_pdf_path and os.path.exists(case.out_lab_result_pdf_path):
        os.remove(case.out_lab_result_pdf_path)

    unique_filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(OUTLAB_REPORT_DIR, unique_filename)
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    from app.schemas.gyne_cyto_case import GyneCytologyCaseUpdate
    updated = crud.update_gyne_case(db, case, GyneCytologyCaseUpdate(
        out_lab_result_pdf_path=file_path,
    ))
    return updated


@router.get("/{case_id}/outlab-test-result")
def get_outlab_test_result(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if not case.out_lab_result_pdf_path:
        raise HTTPException(status_code=404, detail="No outlab test result uploaded for this case.")
    if not os.path.exists(case.out_lab_result_pdf_path):
        raise HTTPException(status_code=404, detail="Result file not found on server.")
    return FileResponse(
        path=case.out_lab_result_pdf_path,
        filename=f"{case.accession_no}_outlab_test.pdf",
        media_type="application/pdf",
    )


@router.post("/{case_id}/outlab-report", response_model=GyneCytologyCaseResponse)
async def upload_outlab_report(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    case = crud.get_gyne_case(db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if not case.is_out_lab_consult:
        raise HTTPException(status_code=400, detail="This case is not flagged as an outlab consult.")

    # Validate magic bytes (%PDF) and enforce 20 MB cap
    data, ext = validate_and_sanitize(file, allowed="pdf")

    # Remove old file from disk if one already exists
    if case.outlab_report_pdf_path and os.path.exists(case.outlab_report_pdf_path):
        os.remove(case.outlab_report_pdf_path)

    unique_filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(OUTLAB_REPORT_DIR, unique_filename)
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    from app.schemas.gyne_cyto_case import GyneCytologyCaseUpdate
    updated = crud.update_gyne_case(db, case, GyneCytologyCaseUpdate(
        outlab_report_pdf_path=file_path,
        consult_status="received",
        status="published",
        is_reported=True,
    ))

    # Create or update a GyneCytoReport snapshot so report_id is available
    from app.models.gyne_cyto_report import GyneCytoReport, GyneReportStatus, GyneReportType
    from app.utils.time import local_now
    existing_report = db.query(GyneCytoReport).filter(GyneCytoReport.case_id == case_id).order_by(GyneCytoReport.created_at.desc()).first()
    if not existing_report:
        patient = case.patient
        settings = db.query(__import__('app.models.system_setting', fromlist=['SystemSetting']).SystemSetting).first()
        patient_age = 0
        if patient and patient.birth_date:
            today = local_now().date()
            bd = patient.birth_date.date() if hasattr(patient.birth_date, 'date') else patient.birth_date
            patient_age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
        now = local_now()
        report = GyneCytoReport(
            case_id=case_id,
            accession_no=case.accession_no,
            patient_title=patient.title.title if patient and patient.title else None,
            patient_name=patient.name if patient else "Unknown",
            patient_hn=case.hn,
            patient_cid=patient.cid if patient else None,
            patient_birth_date=patient.birth_date if patient else None,
            patient_age=patient_age,
            patient_gender=patient.gender if patient else None,
            hospital_id=case.hospital_id,
            hospital_name=case.hospital.name if case.hospital else None,
            department_name=case.department.name if case.department else None,
            clinician_name=case.clinician_name,
            pathologist_id=case.pathologist_id,
            pathologist_name=case.pathologist.report_name or case.pathologist.full_name if case.pathologist else None,
            lab_name_snapshot=settings.lab_name_th if settings else "",
            lab_address_snapshot=settings.lab_address if settings else "",
            report_type=GyneReportType.FINAL,
            status=GyneReportStatus.PUBLISHED,
            version_no=1,
            reported_at=now,
            approved_at=now,
            published_at=now,
        )
        db.add(report)
        db.commit()
    else:
        now = local_now()
        existing_report.published_at = now
        existing_report.approved_at = now
        db.commit()

    return updated


@router.get("/{case_id}/outlab-report")
def get_outlab_report(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if not case.outlab_report_pdf_path:
        raise HTTPException(status_code=404, detail="No outlab report uploaded for this case.")
    if not os.path.exists(case.outlab_report_pdf_path):
        raise HTTPException(status_code=404, detail="Report file not found on server.")
    return FileResponse(
        path=case.outlab_report_pdf_path,
        filename=f"{case.accession_no}_outlab.pdf",
        media_type="application/pdf",
    )
