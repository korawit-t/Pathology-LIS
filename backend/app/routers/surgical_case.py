import logging
import os
import uuid
from datetime import datetime, date, time
from app.utils.time import local_now
from app.utils.file_handler import validate_and_sanitize
from app.crud.consult_pdf import save_consult_pdf, clear_consult_pdf, approve_consult_pdf

logger = logging.getLogger(__name__)
from typing import List, Optional, Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Query,
    UploadFile,
    File,
    Form,
    Response,
)
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse

from sqlalchemy import func
from app.db.database import get_db
from app.models.user import User
from app.models.surgical_case import SurgicalCase
from app.models.surgical_request_file import SurgicalRequestFile
from app.models.surgical_report import SurgicalReport
from app.schemas.surgical_case import (
    SurgicalCaseCreate,
    SurgicalCaseResponse,
    SurgicalCaseUpdate,
    SurgicalCasePaginationResponse,
    CaseCancelRequest,
    SpecimenStorageBulkUpdate,
    SpecimenDisposeBulkUpdate,
    CostSummaryResponse,
    HospitalBillingResponse,
    OutLabConsultRequest,
    OutLabConsultStateResponse,
)
from app.core.roles import CAN_REQUEST_CONSULT
from app.crud import surgical_case as crud_case
from app.dependencies.auth import get_current_user, RoleChecker, check_password_status, assert_hospital_scoped_access, get_scoped_hospital_ids

router = APIRouter(
    prefix="/surgical-cases",
    tags=[
        "Surgical Cases"
    ],  # 🔒 ใส่ตรงนี้! เพื่อบอกว่า "ทุกฟังก์ชันในไฟล์นี้ ต้องผ่านด่านตรวจรหัสผ่านก่อน"
    dependencies=[Depends(check_password_status)],
)


@router.get("/search-public-all", tags=["Public Search"])
def search_all_reports_public(
    q: str = Query(..., min_length=3),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """Unified public search across Surgical, Gyne Cytology, and Non-Gyne Cytology cases."""
    from sqlalchemy import func, and_, or_
    from app.models.surgical_case import SurgicalCase
    from app.models.surgical_report import SurgicalReport
    from app.models.gyne_cyto_case import GyneCytologyCase
    from app.models.gyne_cyto_report import GyneCytoReport
    from app.models.nongyne_cyto_case import NongyneCytologyCase
    from app.models.nongyne_cyto_report import NongyneCytoReport
    from app.models.patient import Patient

    allowed_hospital_ids = get_scoped_hospital_ids(current_user)
    if allowed_hospital_ids is not None and not allowed_hospital_ids:
        raise HTTPException(status_code=403, detail="No hospital assigned to this account")

    s = f"%{q}%"
    items = []

    # --- Surgical ---
    surg_latest = (
        db.query(func.max(SurgicalReport.id))
        .group_by(SurgicalReport.case_id)
        .scalar_subquery()
    )
    surg_q = (
        db.query(SurgicalCase, SurgicalReport)
        .outerjoin(SurgicalReport, and_(
            SurgicalCase.id == SurgicalReport.case_id,
            SurgicalReport.id.in_(surg_latest),
            SurgicalReport.status == "published",
        ))
        .join(SurgicalCase.patient)
        .filter(or_(SurgicalCase.accession_no.ilike(s), SurgicalCase.hn.ilike(s), Patient.name.ilike(s)))
    )
    if allowed_hospital_ids is not None:
        surg_q = surg_q.filter(SurgicalCase.hospital_id.in_(allowed_hospital_ids))
    for case, report in surg_q.all():
        items.append({
            "case_type": "SURGICAL",
            "case_id": case.id,
            "report_id": report.id if report else None,
            "accession_no": case.accession_no,
            "patient_title": (case.patient.title.title if case.patient and case.patient.title else None),
            "patient_name": case.patient.name if case.patient else "Unknown",
            "patient_ln": case.patient.ln if case.patient else None,
            "is_pending": bool(getattr(case, "is_pending", False)),
            "pending_reason": getattr(case, "pending_reason", None),
            "patient_hn": case.hn,
            "specimen_name": ", ".join(s.specimen_name for s in case.specimens) or "-",
            "clinician_name": case.clinician_name or "-",
            "is_express": case.is_express,
            "status": "published" if report else case.status,
            "registered_at": case.registered_at,
            "published_at": report.published_at if report else None,
            "pathologist_name": report.pathologist_name if report else "-",
            "is_read": report.is_read if report else None,
            "read_at": report.read_at if report else None,
        })

    # --- Gyne Cytology ---
    gyne_latest = (
        db.query(func.max(GyneCytoReport.id))
        .group_by(GyneCytoReport.case_id)
        .scalar_subquery()
    )
    gyne_q = (
        db.query(GyneCytologyCase, GyneCytoReport)
        .outerjoin(GyneCytoReport, and_(
            GyneCytologyCase.id == GyneCytoReport.case_id,
            GyneCytoReport.id.in_(gyne_latest),
            GyneCytoReport.status == "published",
        ))
        .join(GyneCytologyCase.patient)
        .filter(or_(GyneCytologyCase.accession_no.ilike(s), GyneCytologyCase.hn.ilike(s), Patient.name.ilike(s)))
    )
    if allowed_hospital_ids is not None:
        gyne_q = gyne_q.filter(GyneCytologyCase.hospital_id.in_(allowed_hospital_ids))
    for case, report in gyne_q.all():
        items.append({
            "case_type": "GYNE",
            "case_id": case.id,
            "report_id": report.id if report else None,
            "accession_no": case.accession_no,
            "patient_title": (case.patient.title.title if case.patient and case.patient.title else None),
            "patient_name": case.patient.name if case.patient else "Unknown",
            "patient_ln": case.patient.ln if case.patient else None,
            "is_pending": bool(getattr(case, "is_pending", False)),
            "pending_reason": getattr(case, "pending_reason", None),
            "patient_hn": case.hn,
            "specimen_name": f"Gyne Cytology — {case.specimen_type}" if getattr(case, "specimen_type", None) else "Gyne Cytology",
            "clinician_name": getattr(case, "clinician_name", "-") or "-",
            "is_express": False,
            "status": "published" if report else case.status,
            "registered_at": case.registered_at,
            "published_at": report.published_at if report else None,
            "pathologist_name": report.pathologist_name if report else "-",
            "is_read": report.is_read if report else None,
            "read_at": report.read_at if report else None,
        })

    # --- Non-Gyne Cytology ---
    ng_latest = (
        db.query(func.max(NongyneCytoReport.id))
        .group_by(NongyneCytoReport.case_id)
        .scalar_subquery()
    )
    ng_q = (
        db.query(NongyneCytologyCase, NongyneCytoReport)
        .outerjoin(NongyneCytoReport, and_(
            NongyneCytologyCase.id == NongyneCytoReport.case_id,
            NongyneCytoReport.id.in_(ng_latest),
            NongyneCytoReport.status == "published",
        ))
        .join(NongyneCytologyCase.patient)
        .filter(or_(NongyneCytologyCase.accession_no.ilike(s), NongyneCytologyCase.hn.ilike(s), Patient.name.ilike(s)))
    )
    if allowed_hospital_ids is not None:
        ng_q = ng_q.filter(NongyneCytologyCase.hospital_id.in_(allowed_hospital_ids))
    for case, report in ng_q.all():
        items.append({
            "case_type": "NONGYNE",
            "case_id": case.id,
            "report_id": report.id if report else None,
            "accession_no": case.accession_no,
            "patient_title": (case.patient.title.title if case.patient and case.patient.title else None),
            "patient_name": case.patient.name if case.patient else "Unknown",
            "patient_ln": case.patient.ln if case.patient else None,
            "is_pending": bool(getattr(case, "is_pending", False)),
            "pending_reason": getattr(case, "pending_reason", None),
            "patient_hn": case.hn,
            "specimen_name": f"Non-Gyne Cytology — {case.specimen_type}" if getattr(case, "specimen_type", None) else "Non-Gyne Cytology",
            "clinician_name": getattr(case, "clinician_name", "-") or "-",
            "is_express": False,
            "status": "published" if report else case.status,
            "registered_at": case.registered_at,
            "published_at": report.published_at if report else None,
            "pathologist_name": report.pathologist_name if report else "-",
            "is_read": report.is_read if report else None,
            "read_at": report.read_at if report else None,
        })

    # Sort combined by registered_at desc, paginate
    items.sort(key=lambda x: x["registered_at"] or "", reverse=True)
    total = len(items)
    start = (page - 1) * size
    return {"items": items[start : start + size], "total": total, "page": page, "size": size}


@router.get(
    "/search-public",
    tags=["Public Search"],  # แยก Tag ออกมาให้เห็นชัดเจนใน Swagger
    # response_model=PublicSearchPagination # ถ้ามี Schema ใหม่ให้ใส่ตรงนี้
)
def search_reports_public(
    q: str = Query(
        ..., min_length=3, description="ค้นหาจาก HN, Accession No, หรือชื่อคนไข้"
    ),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """
    Endpoint สำหรับ Clinician/Public สืบค้นสถานะเคสและผลการตรวจล่าสุด:
    - ค้นเจอทุกเคสที่มีในระบบ (เพื่อแสดงว่ากำลังตรวจหรือเสร็จแล้ว)
    - กรองข้อมูลตาม hospital_id ของ User
    """
    # กรองเฉพาะโรงพยาบาลที่สังกัด (ยกเว้น admin/internal staff)
    allowed_hospital_ids = get_scoped_hospital_ids(current_user)
    if allowed_hospital_ids is not None and not allowed_hospital_ids:
        raise HTTPException(
            status_code=403,
            detail="บัญชีของคุณไม่มีสิทธิ์เข้าถึงข้อมูลเนื่องจากไม่ระบุสังกัดโรงพยาบาล",
        )

    return crud_case.search_public_cases_with_latest_report(
        db, page=page, size=size, search=q, hospital_ids=allowed_hospital_ids
    )


@router.get(
    "/hospital-cases",
    tags=["Public Search"],
)
def list_hospital_cases(
    q: Optional[str] = Query(None, min_length=3, description="ค้นหาจาก HN, Accession No, หรือชื่อคนไข้"),
    status_filter: Optional[str] = Query(None, alias="status"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """
    Endpoint สำหรับ Hospital Staff ดูเคสทั้งหมดของโรงพยาบาลตัวเอง (ไม่ต้องระบุ q)
    """
    allowed_hospital_ids = get_scoped_hospital_ids(current_user)
    if allowed_hospital_ids is not None and not allowed_hospital_ids:
        raise HTTPException(
            status_code=403,
            detail="บัญชีของคุณไม่มีสิทธิ์เข้าถึงข้อมูลเนื่องจากไม่ระบุสังกัดโรงพยาบาล",
        )

    return crud_case.list_hospital_cases(
        db,
        page=page,
        size=size,
        search=q,
        hospital_ids=allowed_hospital_ids,
        status_filter=status_filter,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/hospital-cases/unread-count", tags=["Public Search"])
def get_hospital_unread_count(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    allowed_hospital_ids = get_scoped_hospital_ids(current_user)
    if allowed_hospital_ids is not None and not allowed_hospital_ids:
        return {"unread": 0}
    count = (
        db.query(func.count(SurgicalReport.id))
        .filter(
            SurgicalReport.status == "published",
            SurgicalReport.is_read.is_(False),
            *([SurgicalReport.hospital_id.in_(allowed_hospital_ids)] if allowed_hospital_ids is not None else []),
        )
        .scalar()
    ) or 0
    return {"unread": count}


@router.post(
    "", response_model=SurgicalCaseResponse, status_code=status.HTTP_201_CREATED
)
def create_case(
    case_in: SurgicalCaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # สร้างเคสพร้อมชิ้นเนื้อในคราวเดียว
    return crud_case.create_case_with_specimens(
        db, case_in=case_in, registrar_id=current_user.id
    )


@router.get(
    "", response_model=SurgicalCasePaginationResponse
)  # 🌟 เปลี่ยนจาก List เป็น PaginationResponse
def read_cases(
    skip: int = 0,
    limit: int = 100,
    search: str = None,
    pathologist_id: int = None,
    status: Optional[List[str]] = Query(None),
    hospital_id: Optional[int] = Query(None),
    medical_scheme_id: Optional[int] = Query(None),
    has_gross_draft: Optional[bool] = Query(None),
    is_out_lab_consult: Optional[bool] = Query(None),
    consult_status: Optional[str] = Query(None),
    has_specimens: Optional[bool] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    is_pending: Optional[bool] = Query(None),
    is_express: Optional[bool] = Query(None),
    exclude_signed: Optional[bool] = Query(None),
    prioritize_status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_hospital_ids = get_scoped_hospital_ids(current_user)
    if allowed_hospital_ids is not None:
        if not allowed_hospital_ids:
            raise HTTPException(status_code=403, detail="No hospital assigned to this account")
        if hospital_id is not None and hospital_id not in allowed_hospital_ids:
            raise HTTPException(status_code=403, detail="Access denied.")

    return crud_case.get_cases(
        db,
        skip=skip,
        limit=limit,
        search=search,
        pathologist_id=pathologist_id,
        status=status,
        hospital_id=hospital_id,
        hospital_ids=list(allowed_hospital_ids) if (allowed_hospital_ids is not None and hospital_id is None) else None,
        medical_scheme_id=medical_scheme_id,
        has_gross_draft=has_gross_draft,
        is_out_lab_consult=is_out_lab_consult,
        consult_status=consult_status,
        has_specimens=has_specimens,
        date_from=datetime.combine(date_from, time.min) if date_from else None,
        date_to=datetime.combine(date_to, time.max) if date_to else None,
        is_pending=is_pending,
        is_express=is_express,
        exclude_signed=exclude_signed,
        prioritize_status=prioritize_status,
    )


@router.get("/dashboard-summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    return crud_case.get_dashboard_summary(db)


@router.get("/hospital-billing-summary", response_model=HospitalBillingResponse)
def get_hospital_billing_summary(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    hospital_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get billing summary for all cases within a date range, optionally filtered by hospital.
    """
    return crud_case.get_hospital_billing_summary(
        db, start_date=start_date, end_date=end_date, hospital_id=hospital_id
    )


@router.get("/hospital-billing-summary/pdf")
def export_hospital_billing_summary_pdf(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    hospital_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Download billing summary as PDF.
    """
    from app.services.pdf_service import generate_pdf_blob
    from app.models.organization import Hospital

    billing_data = crud_case.get_hospital_billing_summary(
        db, start_date=start_date, end_date=end_date, hospital_id=hospital_id
    )

    hospital_name = "ทั้งหมด (All Hospitals)"
    if hospital_id:
        hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
        if hospital:
            hospital_name = hospital.name

    report_data = {
        "hospital_name": hospital_name,
        "start_date": start_date.strftime("%d/%m/%Y"),
        "end_date": end_date.strftime("%d/%m/%Y"),
        "printed_on": local_now().strftime("%d/%m/%Y %H:%M"),
        "items": billing_data["items"],
        "total_cases": billing_data["total_cases"],
        "all_cases_grand_total": billing_data["all_cases_grand_total"]
    }

    pdf_blob = generate_pdf_blob(report_data, "reports/hospital_billing_summary.html")

    filename = f"billing_summary_{local_now().strftime('%Y%m%d%H%M')}.pdf"
    return Response(
        content=pdf_blob,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# --- Workload Summary (must be before /{case_id} to avoid route conflict) ---
@router.get("/workload-summary")
def get_workload_summary(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    pathologist_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return crud_case.get_workload_summary(db, date_from, date_to, pathologist_id)


@router.get("/workload-daily")
def get_workload_daily(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    pathologist_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Per-day workload breakdown for chart display."""
    return crud_case.get_workload_daily(db, date_from, date_to, pathologist_id)


@router.get("/workload-ihc-top")
def get_workload_ihc_top(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    pathologist_id: Optional[int] = Query(default=None),
    limit: int = Query(default=10, le=20),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Top N IHC markers ordered by a pathologist in the given date range."""
    return crud_case.get_workload_ihc_top(db, date_from, date_to, pathologist_id, limit)


@router.get("/immuno-stats")
def get_immuno_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Count distinct cases with pending IHC or Special Stain block stains."""
    return crud_case.get_immuno_stats(db)


@router.get("/tat-stats")
def get_tat_stats(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    pathologist_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """TAT statistics: average business days (weekends/holidays excluded), distribution buckets, monthly breakdown."""
    return crud_case.get_tat_stats(db, date_from, date_to, pathologist_id)


@router.get("/tat-cases")
def get_tat_cases(
    bucket: str = Query(..., pattern="^(lt3|t3_5|t5_10|gt10)$"),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    pathologist_id: Optional[int] = Query(default=None),
    is_express: Optional[bool] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List cases (accession_no, patient, tat days) belonging to a TAT distribution bucket."""
    return crud_case.get_tat_cases(db, bucket, date_from, date_to, pathologist_id, is_express)


@router.get("/cancer-registry-summary")
def get_cancer_registry_summary(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Cancer registry: malignancy counts by month and by specimen name."""
    return crud_case.get_cancer_registry_summary(db, date_from, date_to)


@router.get("/slide-quality-stats")
def read_surgical_slide_quality_stats(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return crud_case.get_slide_quality_stats(db, start_date, end_date)


@router.get("/{case_id}", response_model=SurgicalCaseResponse)
def read_case(case_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_case = crud_case.get_case(db, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
    assert_hospital_scoped_access(current_user, db_case.hospital_id)
    return db_case

@router.get("/{case_id}/cost-summary", response_model=CostSummaryResponse)
def get_case_cost_summary(case_id: int, db: Session = Depends(get_db)):
    summary = crud_case.get_case_cost_summary(db, case_id=case_id)
    return summary


@router.patch("/{case_id}", response_model=SurgicalCaseResponse)
def update_case(
    case_id: int,
    case_in: SurgicalCaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. ตรวจสอบก่อนว่ามีเคสนี้จริงไหม
    db_case = crud_case.get_case(db, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    # 2. เรียกใช้ฟังก์ชัน Update ที่เราเขียนไว้ใน CRUD
    return crud_case.update_case(db, db_obj=db_case, obj_in=case_in)


# --- 📂 Specimen Storage Endpoints ---
@router.get("/unstored/specimens", response_model=List[SurgicalCaseResponse])
def get_unstored_specimens(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all surgical cases where specimen_storage_status is null
    """
    return crud_case.get_unstored_cases(db=db)

@router.get("/stored/specimens", response_model=SurgicalCasePaginationResponse)
def get_stored_specimens(
    skip: int = 0,
    limit: int = 50,
    search: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get paginated surgical cases where specimen_storage_status is NOT null
    """
    return crud_case.get_stored_cases(db=db, skip=skip, limit=limit, search=search)

@router.get("/disposed/specimens", response_model=SurgicalCasePaginationResponse)
def get_disposed_specimens(
    skip: int = 0,
    limit: int = 50,
    search: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get paginated surgical cases where discard_status is True
    """
    return crud_case.get_disposed_cases(db=db, skip=skip, limit=limit, search=search)

@router.post("/storage/bulk-update", response_model=List[SurgicalCaseResponse])
def bulk_update_storage(
    storage_data: SpecimenStorageBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk update specimen storage status and container number for multiple cases
    """
    return crud_case.bulk_update_storage_status(
        db=db, 
        case_ids=storage_data.case_ids, 
        container_number=storage_data.container_number,
        user_id=current_user.id
    )

@router.post("/storage/bulk-dispose", response_model=List[SurgicalCaseResponse])
def bulk_dispose_storage_endpoint(
    dispose_data: SpecimenDisposeBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk update specimen storage status to Discarded for multiple cases
    """
    return crud_case.bulk_dispose_storage(
        db=db, 
        case_ids=dispose_data.case_ids,
        user_id=current_user.id
    )

# --- ฟังก์ชันสำหรับลบจริง (Hard Delete) เฉพาะสถานะ registered ---
@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(
    case_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(RoleChecker(["admin"])),
):
    """
    ลบเคสแบบ Hard Delete (เฉพาะ Admin)
    """
    success = crud_case.delete_case(db=db, case_id=case_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )
    return None


# --- 📂 Request Files Endpoints ---

UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "requests")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/{case_id}/request-files", response_model=None)
async def upload_request_file(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a request document (PDF or JPG) for a specific surgical case
    """
    case = crud_case.get_case(db=db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)

    # Validate magic bytes, enforce 30 MB cap, strip EXIF for images
    data, ext = validate_and_sanitize(file, allowed="mixed")

    unique_filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Create Database Record
    new_file_record = SurgicalRequestFile(
        case_id=case_id,
        file_path=file_path,
        file_name=file.filename,
        file_type=file.content_type,
        uploaded_by_id=current_user.id
    )
    db.add(new_file_record)
    db.commit()
    db.refresh(new_file_record)

    return {"message": "File uploaded successfully", "file_id": new_file_record.id}


@router.get("/request-files/{file_id}")
def download_request_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Download a request document by file ID
    """
    req_file = db.query(SurgicalRequestFile).filter(SurgicalRequestFile.id == file_id).first()
    if not req_file:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    case = db.query(SurgicalCase).filter(SurgicalCase.id == req_file.case_id).first()
    assert_hospital_scoped_access(current_user, case.hospital_id if case else None)

    if not os.path.exists(req_file.file_path):
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Physical file not found on server")

    return FileResponse(
        path=req_file.file_path,
        filename=req_file.file_name,
        media_type=req_file.file_type
    )

@router.delete("/request-files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a request document
    """
    req_file = db.query(SurgicalRequestFile).filter(SurgicalRequestFile.id == file_id).first()
    if not req_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    case = db.query(SurgicalCase).filter(SurgicalCase.id == req_file.case_id).first()
    assert_hospital_scoped_access(current_user, case.hospital_id if case else None)

    # Delete physical file
    if os.path.exists(req_file.file_path):
        try:
            os.remove(req_file.file_path)
        except Exception as e:
             # Log the error, but proceed to delete db record or handle appropriately
             logger.warning("Failed to remove physical file %s: %s", req_file.file_path, e)

    # Delete DB record
    db.delete(req_file)
    db.commit()
    return None


# --- 📂 Consult PDF Endpoints ---

@router.post("/{case_id}/consult-pdf", response_model=None)
async def upload_consult_pdf(
    case_id: int,
    file: UploadFile = File(...),
    received_at: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = crud_case.get_case(db=db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)

    save_consult_pdf(db, case, "surgical", file, received_at)

    return {"message": "Uploaded successfully"}

@router.delete("/{case_id}/consult-pdf")
def delete_consult_pdf(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    case = crud_case.get_case(db=db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)

    clear_consult_pdf(db, case)
    return {"message": "Consult PDF removed successfully"}

@router.get("/{case_id}/consult-pdf")
def download_consult_pdf(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    case = crud_case.get_case(db=db, case_id=case_id)
    if not case or not case.consult_pdf_path:
        raise HTTPException(status_code=404, detail="File not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)

    if not os.path.exists(case.consult_pdf_path):
        raise HTTPException(status_code=404, detail="Physical file missing")

    return FileResponse(
        path=case.consult_pdf_path,
        filename=os.path.basename(case.consult_pdf_path),
        media_type="application/pdf"
    )

@router.post("/{case_id}/consult-pdf/approve")
def approve_consult_pdf_endpoint(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = crud_case.get_case(db=db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)
    if not case.consult_pdf_path:
        raise HTTPException(status_code=400, detail="No consult PDF uploaded to approve")

    approve_consult_pdf(db, case, current_user.id)
    display_name = current_user.report_name or current_user.full_name
    return {
        "consult_pdf_approved_by": display_name,
        "consult_pdf_approved_at": case.consult_pdf_approved_at.isoformat(),
    }


# --- 📂 Out-Lab Consult Flag Endpoints ---
# Flagging a case for out-lab consult used to be possible only as part of
# sign-off (FinalizeReportPage → bulk_save_draft_orchestrator). These two let
# the pathologist queue / un-queue a case from the Case Actions panel while the
# diagnosis is still a draft.

@router.post("/{case_id}/outlab-consult", response_model=OutLabConsultStateResponse)
def request_outlab_consult(
    case_id: int,
    payload: OutLabConsultRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_REQUEST_CONSULT),
):
    case = crud_case.get_case(db=db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)

    return crud_case.request_out_lab_consult(db, db_obj=case, reason=payload.reason)


@router.delete("/{case_id}/outlab-consult", response_model=OutLabConsultStateResponse)
def cancel_outlab_consult(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_REQUEST_CONSULT),
):
    case = crud_case.get_case(db=db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    assert_hospital_scoped_access(current_user, case.hospital_id)

    return crud_case.cancel_out_lab_consult(db, db_obj=case)


# --- ฟังก์ชันสำหรับยกเลิก (Soft Delete) สำหรับเคสที่สถานะเลย Registered ไปแล้ว ---
@router.post("/{case_id}/cancel", response_model=SurgicalCaseResponse)
def cancel_case(
    case_id: int,
    payload: CaseCancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker(["admin", "lab_manager"])),
):
    # เรียกใช้ฟังก์ชัน cancel ที่เราเตรียมไว้ใน CRUD
    db_case = crud_case.cancel_surgical_case(
        db, case_id=case_id, user_id=current_user.id, reason=payload.reason
    )

    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    return db_case
