import logging
import os
import shutil
import uuid
import mimetypes
from datetime import datetime, date, time
from app.utils.time import local_now
from app.utils.file_handler import validate_and_sanitize
from app.crud.consult_pdf import save_consult_pdf, clear_consult_pdf

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
from pydantic import ValidationError
from fastapi.responses import FileResponse

from sqlalchemy import func
from app.db.database import get_db
from app.models.user import User
from app.models.surgical_case import SurgicalCase
from app.models.surgical_request_file import SurgicalRequestFile
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.surgical_diagnosis import SurgicalDiagnosis
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
)
from app.crud import surgical_case as crud_case
from app.dependencies.auth import get_current_user, RoleChecker, check_password_status
from app.models.user import User

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

    user_hospital_id = getattr(current_user, "hospital_id", None)
    user_roles = getattr(current_user, "roles", [])
    target_hospital_id = None
    if "admin" not in user_roles:
        if not user_hospital_id:
            raise HTTPException(status_code=403, detail="No hospital assigned to this account")
        target_hospital_id = user_hospital_id

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
    if target_hospital_id:
        surg_q = surg_q.filter(SurgicalCase.hospital_id == target_hospital_id)
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
    if target_hospital_id:
        gyne_q = gyne_q.filter(GyneCytologyCase.hospital_id == target_hospital_id)
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
    if target_hospital_id:
        ng_q = ng_q.filter(NongyneCytologyCase.hospital_id == target_hospital_id)
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
    user_hospital_id = getattr(current_user, "hospital_id", None)
    user_roles = getattr(current_user, "roles", [])

    # กรองเฉพาะโรงพยาบาลที่สังกัด (ยกเว้น admin ระบบ)
    target_hospital_id = None
    if "admin" not in user_roles:
        if not user_hospital_id:
            raise HTTPException(
                status_code=403,
                detail="บัญชีของคุณไม่มีสิทธิ์เข้าถึงข้อมูลเนื่องจากไม่ระบุสังกัดโรงพยาบาล",
            )
        target_hospital_id = user_hospital_id

    return crud_case.search_public_cases_with_latest_report(
        db, page=page, size=size, search=q, hospital_id=target_hospital_id
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
    user_hospital_id = getattr(current_user, "hospital_id", None)
    user_roles = getattr(current_user, "roles", [])

    target_hospital_id = None
    if "admin" not in user_roles:
        if not user_hospital_id:
            raise HTTPException(
                status_code=403,
                detail="บัญชีของคุณไม่มีสิทธิ์เข้าถึงข้อมูลเนื่องจากไม่ระบุสังกัดโรงพยาบาล",
            )
        target_hospital_id = user_hospital_id

    return crud_case.list_hospital_cases(
        db,
        page=page,
        size=size,
        search=q,
        hospital_id=target_hospital_id,
        status_filter=status_filter,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/hospital-cases/unread-count", tags=["Public Search"])
def get_hospital_unread_count(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    user_hospital_id = getattr(current_user, "hospital_id", None)
    user_roles = getattr(current_user, "roles", [])
    if "admin" not in user_roles and not user_hospital_id:
        return {"unread": 0}
    count = (
        db.query(func.count(SurgicalReport.id))
        .filter(
            SurgicalReport.status == "published",
            SurgicalReport.is_read.is_(False),
            *([SurgicalReport.hospital_id == user_hospital_id] if user_hospital_id and "admin" not in user_roles else []),
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
    db: Session = Depends(get_db),
):
    return crud_case.get_cases(
        db,
        skip=skip,
        limit=limit,
        search=search,
        pathologist_id=pathologist_id,
        status=status,
        hospital_id=hospital_id,
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
    """Workload statistics: cases, blocks, stain counts, consults — filtered by registration date.
    Pass pathologist_id to restrict to a specific pathologist's personal workload."""
    from sqlalchemy import and_

    filters = [SurgicalCase.is_cancelled == False]
    if date_from:
        filters.append(SurgicalCase.registered_at >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(SurgicalCase.registered_at <= datetime.combine(date_to, time.max))
    if pathologist_id is not None:
        filters.append(SurgicalCase.pathologist_id == pathologist_id)

    case_filter = and_(*filters)

    total_cases = db.query(func.count(SurgicalCase.id)).filter(case_filter).scalar() or 0

    signed_cases = (
        db.query(func.count(SurgicalCase.id.distinct()))
        .join(SurgicalDiagnosis, SurgicalDiagnosis.case_id == SurgicalCase.id)
        .filter(case_filter, SurgicalDiagnosis.status == "signed")
        .scalar() or 0
    ) if pathologist_id is not None else None

    total_blocks = (
        db.query(func.count(SurgicalBlock.id))
        .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
        .join(SurgicalCase, SurgicalSpecimen.case_id == SurgicalCase.id)
        .filter(case_filter)
        .scalar() or 0
    )

    def _stain_count(*extra_filters):
        return (
            db.query(func.count(SurgicalBlockStain.id))
            .join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
            .join(SurgicalBlock, SurgicalBlockStain.block_id == SurgicalBlock.id)
            .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
            .join(SurgicalCase, SurgicalSpecimen.case_id == SurgicalCase.id)
            .filter(case_filter, *extra_filters)
            .scalar() or 0
        )

    he_slides = _stain_count(AnatomicalPathologyTest.name.ilike("%H&E%"))
    special_stain_slides = _stain_count(
        AnatomicalPathologyTest.category == "Histochem",
        ~AnatomicalPathologyTest.name.ilike("%H&E%"),
    )
    ihc_slides = _stain_count(AnatomicalPathologyTest.category == "IHC")

    consult_cases = (
        db.query(func.count(SurgicalCase.id))
        .filter(case_filter, SurgicalCase.is_out_lab_consult == True)
        .scalar() or 0
    )

    result = {
        "total_cases": total_cases,
        "total_blocks": total_blocks,
        "he_slides": he_slides,
        "special_stain_slides": special_stain_slides,
        "ihc_slides": ihc_slides,
        "consult_cases": consult_cases,
    }
    if signed_cases is not None:
        result["signed_cases"] = signed_cases
    return result


@router.get("/workload-daily")
def get_workload_daily(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    pathologist_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Per-day workload breakdown for chart display."""
    from sqlalchemy import and_, cast
    from sqlalchemy.dialects.postgresql import DATE as PG_DATE
    from datetime import timedelta

    filters = [SurgicalCase.is_cancelled == False]
    if date_from:
        filters.append(SurgicalCase.registered_at >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(SurgicalCase.registered_at <= datetime.combine(date_to, time.max))
    if pathologist_id is not None:
        filters.append(SurgicalCase.pathologist_id == pathologist_id)
    case_filter = and_(*filters)

    day_col = func.date(SurgicalCase.registered_at).label("day")

    daily_cases = {
        str(r.day): r.cnt
        for r in db.query(day_col, func.count(SurgicalCase.id).label("cnt"))
        .filter(case_filter)
        .group_by(func.date(SurgicalCase.registered_at))
        .all()
    }

    def _daily_stain(label, *extra):
        return {
            str(r.day): r.cnt
            for r in db.query(
                func.date(SurgicalCase.registered_at).label("day"),
                func.count(SurgicalBlockStain.id).label("cnt"),
            )
            .join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
            .join(SurgicalBlock, SurgicalBlockStain.block_id == SurgicalBlock.id)
            .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
            .join(SurgicalCase, SurgicalSpecimen.case_id == SurgicalCase.id)
            .filter(case_filter, *extra)
            .group_by(func.date(SurgicalCase.registered_at))
            .all()
        }

    daily_he = _daily_stain("he", AnatomicalPathologyTest.name.ilike("%H&E%"))
    daily_special = _daily_stain(
        "special",
        AnatomicalPathologyTest.category == "Histochem",
        ~AnatomicalPathologyTest.name.ilike("%H&E%"),
    )
    daily_ihc = _daily_stain("ihc", AnatomicalPathologyTest.category == "IHC")

    # Generate every date in range so days with 0 cases still appear
    if date_from and date_to:
        all_dates = [
            str(date_from + timedelta(days=i))
            for i in range((date_to - date_from).days + 1)
        ]
    else:
        all_dates = sorted(set(daily_cases) | set(daily_he) | set(daily_special) | set(daily_ihc))

    return [
        {
            "date": d,
            "cases": daily_cases.get(d, 0),
            "he_slides": daily_he.get(d, 0),
            "special_stain_slides": daily_special.get(d, 0),
            "ihc_slides": daily_ihc.get(d, 0),
        }
        for d in all_dates
    ]


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
    from sqlalchemy import and_

    filters = [SurgicalCase.is_cancelled == False]
    if date_from:
        filters.append(SurgicalCase.registered_at >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(SurgicalCase.registered_at <= datetime.combine(date_to, time.max))
    if pathologist_id is not None:
        filters.append(SurgicalCase.pathologist_id == pathologist_id)

    rows = (
        db.query(
            AnatomicalPathologyTest.name,
            func.count(SurgicalBlockStain.id).label("count"),
        )
        .join(SurgicalBlockStain, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
        .join(SurgicalBlock, SurgicalBlockStain.block_id == SurgicalBlock.id)
        .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
        .join(SurgicalCase, SurgicalSpecimen.case_id == SurgicalCase.id)
        .filter(AnatomicalPathologyTest.category == "IHC", and_(*filters))
        .group_by(AnatomicalPathologyTest.name)
        .order_by(func.count(SurgicalBlockStain.id).desc())
        .limit(limit)
        .all()
    )
    return [{"name": r.name, "count": r.count} for r in rows]


@router.get("/immuno-stats")
def get_immuno_stats(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Count distinct cases with pending IHC or Special Stain block stains."""
    from app.models.surgical_block import SurgicalBlock
    from app.models.surgical_block_stain import SurgicalBlockStain

    def _count(category_filter, is_external=None):
        q = (
            db.query(func.count(SurgicalCase.id.distinct()))
            .join(SurgicalSpecimen, SurgicalSpecimen.case_id == SurgicalCase.id)
            .join(SurgicalBlock, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
            .join(SurgicalBlockStain, SurgicalBlockStain.block_id == SurgicalBlock.id)
            .join(AnatomicalPathologyTest, AnatomicalPathologyTest.id == SurgicalBlockStain.test_id)
            .filter(
                SurgicalBlockStain.status == "pending",
                AnatomicalPathologyTest.category == category_filter,
                SurgicalCase.status != "cancelled",
            )
        )
        if category_filter == "Histochem":
            q = q.filter(~AnatomicalPathologyTest.name.ilike("%H&E%"))
        if is_external is not None:
            q = q.filter(AnatomicalPathologyTest.is_external == is_external)
        return q.scalar() or 0

    return {
        "pending_ihc": _count("IHC"),
        "pending_special_stain": _count("Histochem"),
        "pending_ihc_internal": _count("IHC", is_external=False),
        "pending_special_stain_internal": _count("Histochem", is_external=False),
        "pending_ihc_outlab": _count("IHC", is_external=True),
        "pending_special_stain_outlab": _count("Histochem", is_external=True),
        "pending_molecular_outlab": _count("Molecular", is_external=True),
    }


@router.get("/tat-stats")
def get_tat_stats(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    pathologist_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """TAT statistics: average days, distribution buckets, monthly breakdown."""
    from collections import defaultdict
    from app.models.system_setting import SystemSetting

    setting = db.query(SystemSetting).first()
    target_days = (setting.surgical_tat_days if setting else None) or 10
    express_target_days = (setting.surgical_express_tat_days if setting else None) or 3

    filters = [
        SurgicalCase.is_cancelled == False,
        SurgicalCase.report_at.isnot(None),
        SurgicalCase.registered_at.isnot(None),
    ]
    if date_from:
        filters.append(SurgicalCase.registered_at >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(SurgicalCase.registered_at <= datetime.combine(date_to, time.max))
    if pathologist_id is not None:
        filters.append(SurgicalCase.pathologist_id == pathologist_id)

    cases = (
        db.query(
            SurgicalCase.id,
            SurgicalCase.registered_at,
            SurgicalCase.report_at,
            SurgicalCase.is_express,
        )
        .filter(*filters)
        .all()
    )

    empty_dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
    if not cases:
        return {
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

    monthly_map: dict = defaultdict(lambda: {"count": 0, "total_days": 0.0})
    dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
    routine_dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
    express_dist = {"lt3": 0, "t3_5": 0, "t5_10": 0, "gt10": 0}
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

        sub_dist = express_dist if c.is_express else routine_dist
        if c.is_express:
            express_total += tat
            express_n += 1
        else:
            routine_total += tat
            routine_n += 1

        for d in (dist, sub_dist):
            if tat < 3:
                d["lt3"] += 1
            elif tat < 5:
                d["t3_5"] += 1
            elif tat <= 10:
                d["t5_10"] += 1
            else:
                d["gt10"] += 1

    total_n = len(cases)
    grand_total = routine_total + express_total

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
        "monthly": [
            {
                "month": k,
                "case_count": v["count"],
                "avg_days": round(v["total_days"] / v["count"], 1),
            }
            for k, v in sorted(monthly_map.items())
        ],
    }


@router.get("/cancer-registry-summary")
def get_cancer_registry_summary(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Cancer registry: malignancy counts by month and by specimen name."""
    from collections import defaultdict

    filters = [SurgicalCase.is_cancelled == False]
    if date_from:
        filters.append(SurgicalCase.registered_at >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(SurgicalCase.registered_at <= datetime.combine(date_to, time.max))

    total = db.query(func.count(SurgicalCase.id)).filter(*filters).scalar() or 0
    malignant = (
        db.query(func.count(SurgicalCase.id))
        .filter(*filters, SurgicalCase.has_malignancy == True)
        .scalar() or 0
    )
    benign = (
        db.query(func.count(SurgicalCase.id))
        .filter(*filters, SurgicalCase.has_malignancy == False)
        .scalar() or 0
    )

    # Monthly breakdown (Python-level grouping for DB compatibility)
    monthly_cases = (
        db.query(
            SurgicalCase.registered_at,
            SurgicalCase.has_malignancy,
        )
        .filter(*filters)
        .all()
    )
    monthly_map: dict = defaultdict(lambda: {"malignant": 0, "benign": 0, "indeterminate": 0})
    for c in monthly_cases:
        k = c.registered_at.strftime("%Y-%m")
        if c.has_malignancy is True:
            monthly_map[k]["malignant"] += 1
        elif c.has_malignancy is False:
            monthly_map[k]["benign"] += 1
        else:
            monthly_map[k]["indeterminate"] += 1

    # Top specimen names
    specimen_rows = (
        db.query(
            SurgicalSpecimen.specimen_name,
            func.count(SurgicalSpecimen.id.distinct()).label("total"),
        )
        .join(SurgicalCase, SurgicalCase.id == SurgicalSpecimen.case_id)
        .filter(*filters, SurgicalCase.has_malignancy == True)
        .group_by(SurgicalSpecimen.specimen_name)
        .order_by(func.count(SurgicalSpecimen.id.distinct()).desc())
        .limit(15)
        .all()
    )

    return {
        "total": total,
        "malignant": malignant,
        "benign": benign,
        "indeterminate": total - malignant - benign,
        "malignancy_rate": round(malignant / total * 100, 1) if total else 0,
        "monthly": [
            {"month": k, **v} for k, v in sorted(monthly_map.items())
        ],
        "by_specimen": [
            {"specimen_name": r.specimen_name, "count": r.total}
            for r in specimen_rows
        ],
    }


@router.get("/slide-quality-stats")
def read_surgical_slide_quality_stats(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from datetime import date as date_type
    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)

    rows = (
        db.query(SurgicalCase.slide_quality, func.count(SurgicalCase.id))
        .filter(
            SurgicalCase.is_cancelled == False,
            func.date(SurgicalCase.registered_at) >= start,
            func.date(SurgicalCase.registered_at) <= end,
        )
        .group_by(SurgicalCase.slide_quality)
        .all()
    )
    result = {"good": 0, "fair": 0, "poor": 0, "unspecified": 0}
    for val, cnt in rows:
        key = val if val in result else "unspecified"
        result[key] += cnt
    return {"total": sum(result.values()), "slide_quality": result, "stain_quality": None}


@router.get("/{case_id}", response_model=SurgicalCaseResponse)
def read_case(case_id: int, db: Session = Depends(get_db)):
    db_case = crud_case.get_case(db, case_id=case_id)
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
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
    
    # Check permissions conceptually if needed
    
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
    
    if not os.path.exists(case.consult_pdf_path):
        raise HTTPException(status_code=404, detail="Physical file missing")
        
    return FileResponse(
        path=case.consult_pdf_path,
        filename=os.path.basename(case.consult_pdf_path),
        media_type="application/pdf"
    )


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
