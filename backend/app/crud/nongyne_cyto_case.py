from sqlalchemy.orm import Session, selectinload
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import func, or_, cast, and_
from fastapi import HTTPException, status
from datetime import datetime
from app.utils.time import local_now
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_diagnosis import NongyneDiagnosis
from app.models.nongyne_cyto_stain import NongyneCytologyStain
from app.models.patient import Patient
from app.models.nongyne_cyto_report import NongyneCytoReport
from app.schemas.nongyne_cyto_case import NongyneCytologyCaseCreate, NongyneCytologyCaseUpdate


def _get_next_nongyne_accession_no(db: Session) -> str:
    from app.models.system_setting import SystemSetting
    current_year_short = local_now().strftime("%y")
    settings = db.query(SystemSetting).first()
    letter = (settings.nongyne_accession_prefix or "N") if settings else "N"
    prefix = f"{letter}{current_year_short}-"

    # ใช้ with_for_update() เพื่อป้องกันเลขซ้ำหากมีการกด Save พร้อมกัน
    last_case = (
        db.query(NongyneCytologyCase.accession_no)
        .filter(NongyneCytologyCase.accession_no.like(f"{prefix}%"))
        .order_by(NongyneCytologyCase.accession_no.desc())
        .with_for_update()
        .first()
    )

    if last_case:
        last_no = last_case[0]
        try:
            # แยกส่วนตัวเลขหลังเครื่องหมาย "-" แล้วบวก 1
            new_run_number = int(last_no.split("-")[1]) + 1
        except (IndexError, ValueError):
            new_run_number = 1
    else:
        new_run_number = 1

    return f"{prefix}{new_run_number:05d}"


def create_nongyne_case(db: Session, obj_in: NongyneCytologyCaseCreate, registrar_id: int):
    try:
        new_accession_no = _get_next_nongyne_accession_no(db)
        case_data = obj_in.model_dump(exclude={"accession_no", "registrar_id"})

        db_obj = NongyneCytologyCase(
            **case_data,
            accession_no=new_accession_no,
            registrar_id=registrar_id,
            status="registered",
        )

        db.add(db_obj)
        db.commit()

        # Query ดึงข้อมูลใหม่พร้อมโหลดตารางที่เกี่ยวข้อง (Eager Loading)
        full_case = (
            db.query(NongyneCytologyCase)
            .options(
                selectinload(NongyneCytologyCase.hospital),
                selectinload(NongyneCytologyCase.department),
                selectinload(NongyneCytologyCase.medical_scheme),
                selectinload(NongyneCytologyCase.patient).selectinload( Patient.title ),
            )
            .filter(NongyneCytologyCase.id == db_obj.id)
            .first()
        )

        # Auto-create slide logic
        from app.crud.nongyne_cyto_stain import auto_create_default_stain
        auto_create_default_stain(db, case_id=db_obj.id)

        return full_case

    except Exception as e:
        db.rollback()
        raise e


def get_nongyne_case(db: Session, case_id: int):
    return (
        db.query(NongyneCytologyCase)
        .options(
            selectinload(NongyneCytologyCase.patient).selectinload(Patient.title),
            selectinload(NongyneCytologyCase.registerer),
            selectinload(NongyneCytologyCase.cytotechnologist),
            selectinload(NongyneCytologyCase.pathologist),
            selectinload(NongyneCytologyCase.hospital),
            selectinload(NongyneCytologyCase.department),
            selectinload(NongyneCytologyCase.medical_scheme),
        )
        .filter(NongyneCytologyCase.id == case_id)
        .first()
    )


def get_nongyne_cases(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    search: str = None,
    status: str = None,
    assigned_user_id: int = None,
    signer_id: int = None,
    hospital_id: int = None,
    medical_scheme_id: int = None,
    is_out_lab_consult: bool = None,
    consult_status: str = None,
    is_cell_block: bool = None,
    cell_block_status: str = None,
    is_reported: bool = None,
    is_screened: bool = None,
    is_pending: bool = None,
    patient_id: int = None,
    date_from: datetime = None,
    date_to: datetime = None,
    stain_status: str = None,
):
    query = db.query(NongyneCytologyCase).join(Patient)

    if assigned_user_id:
        query = query.filter(
            or_(
                NongyneCytologyCase.pathologist_id == assigned_user_id,
                NongyneCytologyCase.cytotechnologist_id == assigned_user_id
            )
        )

    if signer_id:
        query = query.join(NongyneDiagnosis, NongyneCytologyCase.id == NongyneDiagnosis.case_id)
        query = query.filter(
            NongyneDiagnosis.is_current.is_(True),
            cast(NongyneDiagnosis.signers, JSONB).contains([{"user_id": signer_id}]),
        )

    if status and status.upper() != "ALL":
        if status.lower() == "screened":
            query = query.filter(NongyneCytologyCase.is_screened.is_(True))
        else:
            query = query.filter(NongyneCytologyCase.status == status.lower())

    if search:
        s = f"%{search}%"
        query = query.filter(
            or_(
                NongyneCytologyCase.accession_no.ilike(s),
                NongyneCytologyCase.hn.ilike(s),
                Patient.name.ilike(s),
            )
        )

    if hospital_id is not None:
        query = query.filter(NongyneCytologyCase.hospital_id == hospital_id)

    if medical_scheme_id is not None:
        query = query.filter(NongyneCytologyCase.medical_scheme_id == medical_scheme_id)

    if is_out_lab_consult is not None:
        query = query.filter(NongyneCytologyCase.is_out_lab_consult == is_out_lab_consult)

    if consult_status:
        query = query.filter(NongyneCytologyCase.consult_status == consult_status)

    if is_cell_block is not None:
        query = query.filter(NongyneCytologyCase.is_cell_block == is_cell_block)

    if cell_block_status:
        query = query.filter(NongyneCytologyCase.cell_block_status == cell_block_status)

    if is_reported is not None:
        query = query.filter(NongyneCytologyCase.is_reported == is_reported)

    if is_screened is not None:
        query = query.filter(NongyneCytologyCase.is_screened == is_screened)

    if is_pending is not None:
        query = query.filter(NongyneCytologyCase.is_pending == is_pending)

    if patient_id is not None:
        query = query.filter(NongyneCytologyCase.patient_id == patient_id)

    if date_from is not None:
        query = query.filter(NongyneCytologyCase.registered_at >= date_from)
    if date_to is not None:
        query = query.filter(NongyneCytologyCase.registered_at <= date_to)

    if stain_status:
        query = query.join(NongyneCytologyStain, NongyneCytologyStain.case_id == NongyneCytologyCase.id).filter(
            NongyneCytologyStain.status == stain_status
        )

    total = query.count()

    items = (
        query.options(
            selectinload(NongyneCytologyCase.patient).selectinload(Patient.title),
            selectinload(NongyneCytologyCase.pathologist),
            selectinload(NongyneCytologyCase.cytotechnologist),
            selectinload(NongyneCytologyCase.hospital),
            selectinload(NongyneCytologyCase.department),
            selectinload(NongyneCytologyCase.medical_scheme),
        )
        .order_by(NongyneCytologyCase.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Attach latest published report id and is_read to each case
    if items:
        case_ids = [c.id for c in items]
        subq = (
            db.query(
                NongyneCytoReport.case_id,
                func.max(NongyneCytoReport.id).label("max_id"),
            )
            .filter(
                NongyneCytoReport.case_id.in_(case_ids),
                NongyneCytoReport.status == "published",
            )
            .group_by(NongyneCytoReport.case_id)
            .subquery()
        )
        latest = (
            db.query(NongyneCytoReport.case_id, NongyneCytoReport.id, NongyneCytoReport.is_read, NongyneCytoReport.read_at)
            .join(subq, and_(NongyneCytoReport.case_id == subq.c.case_id, NongyneCytoReport.id == subq.c.max_id))
            .all()
        )
        report_map = {row.case_id: {"id": row.id, "is_read": row.is_read, "read_at": row.read_at} for row in latest}
        for c in items:
            info = report_map.get(c.id)
            c.latest_report_id = info["id"] if info else None
            c.report_is_read = info["is_read"] if info else None
            c.report_read_at = info["read_at"] if info else None

    # Attach has_correlation flag
    if items:
        from app.models.nongyne_cyto_histo_correlation import NongyneCytoHistoCorrelation
        corr_case_ids = set(
            row[0] for row in db.query(NongyneCytoHistoCorrelation.nongyne_case_id)
            .filter(NongyneCytoHistoCorrelation.nongyne_case_id.in_(case_ids))
            .distinct()
            .all()
        )
        for c in items:
            c.has_correlation = c.id in corr_case_ids

    return {"items": items, "total": total}


def update_nongyne_case(
    db: Session, db_obj: NongyneCytologyCase, obj_in: NongyneCytologyCaseUpdate
):
    update_data = obj_in.model_dump(exclude_unset=True)

    readonly_fields = ["id", "accession_no", "registrar_id", "registered_at"]

    for field in update_data:
        if field not in readonly_fields and hasattr(db_obj, field):
            setattr(db_obj, field, update_data[field])

    if update_data.get("is_out_lab_consult") and db_obj.consult_status is None:
        db_obj.consult_status = "pending"

    try:
        db.add(db_obj)
        db.commit()

        full_db_obj = (
            db.query(NongyneCytologyCase)
            .options(
                selectinload(NongyneCytologyCase.patient).selectinload(Patient.title),
                selectinload(NongyneCytologyCase.hospital),
                selectinload(NongyneCytologyCase.pathologist),
                selectinload(NongyneCytologyCase.cytotechnologist),
            )
            .filter(NongyneCytologyCase.id == db_obj.id)
            .first()
        )

        return full_db_obj
    except Exception as e:
        db.rollback()
        raise e


def delete_nongyne_case(db: Session, case_id: int):
    db_obj = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()

    if not db_obj:
        return None

    if db_obj.status != "registered":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete case in status: {db_obj.status}",
        )

    try:
        db.delete(db_obj)
        db.commit()
        return db_obj
    except Exception as e:
        db.rollback()
        raise e


def get_nongyne_statistics(
    db: Session, start_date, end_date, pathologist_id: int = None, cytotechnologist_id: int = None
):
    from collections import defaultdict

    query = db.query(NongyneCytologyCase).filter(
        func.date(NongyneCytologyCase.registered_at) >= start_date,
        func.date(NongyneCytologyCase.registered_at) <= end_date,
    )
    if pathologist_id:
        query = query.filter(NongyneCytologyCase.pathologist_id == pathologist_id)
    if cytotechnologist_id:
        query = query.filter(NongyneCytologyCase.cytotechnologist_id == cytotechnologist_id)

    all_cases = query.all()
    total_cases = len(all_cases)

    daily_map = defaultdict(lambda: {"total_cases": 0, "total_tt_seconds": 0, "valid_tt_count": 0})
    tt_dist_map = defaultdict(int)
    total_tt_seconds = 0
    valid_tt_count = 0

    for case in all_cases:
        if not case.registered_at:
            continue
        reg_date = case.registered_at.strftime("%Y-%m-%d")
        daily_map[reg_date]["total_cases"] += 1

        if case.is_reported and case.report_at:
            delta = case.report_at - case.registered_at
            secs = max(delta.total_seconds(), 0)
            daily_map[reg_date]["total_tt_seconds"] += secs
            daily_map[reg_date]["valid_tt_count"] += 1
            total_tt_seconds += secs
            valid_tt_count += 1
            tt_dist_map[max(delta.days, 0)] += 1

    avg_tt_secs = total_tt_seconds / valid_tt_count if valid_tt_count else 0

    daily_stats = [
        {
            "date": d,
            "total_cases": v["total_cases"],
            "average_tt_hours": round(v["total_tt_seconds"] / v["valid_tt_count"] / 3600, 2)
            if v["valid_tt_count"] else 0,
        }
        for d, v in sorted(daily_map.items())
    ]

    tt_distribution = [
        {"tt_days": str(d), "case_count": c}
        for d, c in sorted(tt_dist_map.items())
    ]

    return {
        "total_cases": total_cases,
        "average_tt_days": round(avg_tt_secs / 86400, 2),
        "average_tt_hours": round(avg_tt_secs / 3600, 2),
        "daily_stats": daily_stats,
        "tt_distribution": tt_distribution,
    }


def get_nongyne_slide_quality_stats(db: Session, start_date, end_date):
    def _count_quality(field):
        rows = (
            db.query(field, func.count(NongyneCytologyCase.id))
            .filter(
                func.date(NongyneCytologyCase.registered_at) >= start_date,
                func.date(NongyneCytologyCase.registered_at) <= end_date,
            )
            .group_by(field)
            .all()
        )
        result = {"good": 0, "fair": 0, "poor": 0, "unspecified": 0}
        for val, cnt in rows:
            key = val if val in result else "unspecified"
            result[key] += cnt
        return result

    slide = _count_quality(NongyneCytologyCase.slide_quality)
    stain = _count_quality(NongyneCytologyCase.stain_quality)
    total = sum(slide.values())
    return {"total": total, "slide_quality": slide, "stain_quality": stain}
