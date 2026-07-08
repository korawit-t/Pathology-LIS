import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
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
    GyneCaseCancelRequest,
)
from app.crud import gyne_cyto_case as crud
from app.crud.consult_pdf import save_consult_pdf, clear_consult_pdf
from app.dependencies.auth import get_current_user, assert_hospital_scoped_access, get_scoped_hospital_ids
from app.models.gyne_cyto_request_file import GyneCytoRequestFile
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.user import User

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
    has_out_lab_result: Optional[bool] = Query(None),
    consult_status: str = None,
    exclude_consult_status: Optional[str] = Query(None),
    is_reported: bool = None,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    review_reason: Optional[str] = Query(None),
    signer_id: Optional[int] = Query(None),
    exclude_status: Optional[str] = Query(None),
    exclude_signed_by: Optional[int] = Query(None),
    signed_by: Optional[int] = Query(None),
    is_reviewed: Optional[bool] = Query(None),
    is_express: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    resolved_user_id = current_user.id if assigned_to_me else assigned_user_id

    allowed_hospital_ids = get_scoped_hospital_ids(current_user)
    if allowed_hospital_ids is not None:
        if not allowed_hospital_ids:
            raise HTTPException(status_code=403, detail="No hospital assigned to this account")
        if hospital_id is not None and hospital_id not in allowed_hospital_ids:
            raise HTTPException(status_code=403, detail="Access denied.")

    return crud.get_gyne_cases(
        db=db,
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        assigned_user_id=resolved_user_id,
        signer_id=signer_id,
        exclude_status=exclude_status,
        exclude_signed_by=exclude_signed_by,
        signed_by=signed_by,
        is_reviewed=is_reviewed,
        hospital_id=hospital_id,
        hospital_ids=list(allowed_hospital_ids) if (allowed_hospital_ids is not None and hospital_id is None) else None,
        is_out_lab_consult=is_out_lab_consult,
        is_out_lab=is_out_lab,
        has_out_lab_result=has_out_lab_result,
        consult_status=consult_status,
        exclude_consult_status=exclude_consult_status,
        is_reported=is_reported,
        date_from=datetime.combine(date_from, time.min) if date_from else None,
        date_to=datetime.combine(date_to, time.max) if date_to else None,
        review_reason=review_reason,
        is_express=is_express,
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


@router.get("/summary-table/cases")
def read_gyne_summary_table_cases(
    start_date: str,
    end_date: str,
    metric: str,
    pathologist_id: int = None,
    cytotechnologist_id: int = None,
    db: Session = Depends(get_db),
):
    from datetime import date as date_type
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)
    return crud.get_gyne_summary_table_cases(db, start, end, metric, pathologist_id, cytotechnologist_id)


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
    from app.utils.tat import get_holiday_dates, business_days_between

    setting = db.query(SystemSetting).first()
    target_days = (setting.gyne_tat_days if setting else None) or 5
    express_target_days = (setting.gyne_express_tat_days if setting else None) or 3
    holidays = get_holiday_dates(db)

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

    empty_dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
    empty = {
        "avg_tat_days": 0,
        "routine_avg_days": 0,
        "express_avg_days": 0,
        "total_reported": 0,
        "on_time_count": 0,
        "on_time_pct": 0,
        "target_days": target_days,
        "express_target_days": express_target_days,
        "distribution": {**empty_dist},
        "routine_distribution": {**empty_dist},
        "express_distribution": {**empty_dist},
        "monthly": [],
    }
    if not cases:
        return empty

    monthly_map: dict = defaultdict(lambda: {"count": 0, "total_days": 0.0})
    dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
    routine_dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
    express_dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
    routine_total, routine_n = 0.0, 0
    express_total, express_n = 0.0, 0
    on_time_count = 0

    for c in cases:
        tat = business_days_between(c.registered_at, c.report_at, holidays)
        month_key = c.registered_at.strftime("%Y-%m")
        monthly_map[month_key]["count"] += 1
        monthly_map[month_key]["total_days"] += tat
        t = express_target_days if c.is_express else target_days
        if tat <= t:
            on_time_count += 1
        sub_dist = express_dist if c.is_express else routine_dist
        if c.is_express:
            express_total += tat; express_n += 1
        else:
            routine_total += tat; routine_n += 1
        for d in (dist, sub_dist):
            if tat < 3: d["lt3"] += 1
            elif tat < 5: d["t3_5"] += 1
            elif tat <= 10: d["t5_10"] += 1
            else: d["gt10"] += 1

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
        "routine_distribution": routine_dist,
        "express_distribution": express_dist,
        "monthly": monthly,
    }


@router.get("/{case_id}", response_model=GyneCytologyCaseResponse)
def read_case(case_id: int, db: Session = Depends(get_db), current_user: Any = Depends(get_current_user)):
    db_case = crud.get_gyne_case(db, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ไม่พบข้อมูลเคส")
    assert_hospital_scoped_access(current_user, db_case.hospital_id)
    return db_case


@router.patch("/{case_id}", response_model=GyneCytologyCaseResponse)  # 🚩 ปรับชื่อ Schema
def update_case_info(
    case_id: int,
    case_in: GyneCytologyCaseUpdate,
    db: Session = Depends(get_db),
    _: Any = Depends(get_current_user),
):
    db_case = crud.get_gyne_case(db, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    return crud.update_gyne_case(db=db, db_obj=db_case, obj_in=case_in)


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(case_id: int, db: Session = Depends(get_db), _: Any = Depends(get_current_user)):
    success = crud.delete_gyne_case(db=db, case_id=case_id)
    if not success:
        raise HTTPException(
            status_code=404, detail="Case not found or cannot be deleted"
        )
    return None


@router.post("/{case_id}/cancel", response_model=GyneCytologyCaseResponse)
def cancel_case(
    case_id: int,
    payload: GyneCaseCancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_case = crud.cancel_gyne_case(
        db, case_id=case_id, user_id=current_user.id, reason=payload.reason
    )
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
    return db_case


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
    assert_hospital_scoped_access(current_user, case.hospital_id)

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
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == req_file.case_id).first()
    assert_hospital_scoped_access(current_user, case.hospital_id if case else None)
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
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == req_file.case_id).first()
    assert_hospital_scoped_access(current_user, case.hospital_id if case else None)
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


# --- 📂 Consult PDF Endpoints ---

@router.post("/{case_id}/consult-pdf", response_model=None)
async def upload_consult_pdf(
    case_id: int,
    file: UploadFile = File(...),
    received_at: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)

    save_consult_pdf(db, case, "gyne", file, received_at)

    return {"message": "Uploaded successfully"}


@router.delete("/{case_id}/consult-pdf")
def delete_consult_pdf(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)

    clear_consult_pdf(db, case)
    return {"message": "Consult PDF removed successfully"}


@router.get("/{case_id}/consult-pdf")
def download_consult_pdf(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if not case or not case.consult_pdf_path or not os.path.exists(case.consult_pdf_path):
        raise HTTPException(status_code=404, detail="File not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)

    return FileResponse(
        path=case.consult_pdf_path,
        filename=os.path.basename(case.consult_pdf_path),
        media_type="application/pdf",
    )
