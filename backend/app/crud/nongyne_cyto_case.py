from sqlalchemy.orm import Session, selectinload
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import Date, func, or_, cast, and_, literal
from fastapi import HTTPException, status
from datetime import datetime
from app.utils.time import local_now
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_diagnosis import NongyneDiagnosis
from app.models.nongyne_cyto_stain import NongyneCytologyStain
from app.models.patient import Patient
from app.models.nongyne_cyto_report import NongyneCytoReport
from app.schemas.nongyne_cyto_case import NongyneCytologyCaseCreate, NongyneCytologyCaseUpdate
from app.crud import cyto_path_correlation as cyto_path_qc


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
        case_data = obj_in.model_dump(exclude={"accession_no", "registrar_id", "num_slides"})

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

        # Auto-create slide logic — if the caller didn't specify a count,
        # fall back to the specimen type's configured default (master data),
        # or 1 if that specimen type has no template/config either.
        num_slides = obj_in.num_slides
        if num_slides is None:
            from app.models.specimen_template import SpecimenTemplate
            template = (
                db.query(SpecimenTemplate)
                .filter(
                    SpecimenTemplate.name == obj_in.specimen_type,
                    SpecimenTemplate.category == "nongyne_cyto",
                )
                .first()
            )
            num_slides = template.default_slide_count if template else 1

        from app.crud.nongyne_cyto_stain import auto_create_default_stain
        auto_create_default_stain(db, case_id=db_obj.id, count=num_slides)

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
            selectinload(NongyneCytologyCase.stains),
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
    exclude_signed_by: int = None,
    hospital_id: int = None,
    hospital_ids: list = None,
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
    is_express: bool = None,
):
    query = db.query(NongyneCytologyCase).join(Patient)

    if is_express is not None:
        query = query.filter(NongyneCytologyCase.is_express == is_express)

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

    if exclude_signed_by:
        signed_case_ids = (
            db.query(NongyneDiagnosis.case_id)
            .filter(
                NongyneDiagnosis.is_current.is_(True),
                func.jsonb_path_exists(
                    cast(NongyneDiagnosis.signers, JSONB),
                    literal(f'$[*] ? (@.user_id == {int(exclude_signed_by)} && @.signed_at != null)')
                )
            )
        )
        query = query.filter(~NongyneCytologyCase.id.in_(signed_case_ids))

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
    elif hospital_ids is not None:
        query = query.filter(NongyneCytologyCase.hospital_id.in_(hospital_ids))

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


def send_nongyne_to_pathologist(
    db: Session,
    case_id: int,
    pathologist_id: int,
    current_user_id: int,
    status_override: str | None = None,
    signers: list | None = None,
):
    """Cytotechnologist hands a screened case to a pathologist.

    Until this existed the hand-off was two independent client calls (PATCH the
    case, PUT the diagnosis) with no server-side transition to hang anything
    off. Doing it here means `screened_at` finally gets written — it never was,
    which is why crud/cyto_workload.py's coalesce(screened_at, report_at, ...)
    has been dating cytotech workload to the report day — and it gives the QC
    ledger the one moment when the screening diagnosis is still the
    cytotechnologist's own words.
    """
    db_obj = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()
    if not db_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    db_obj.pathologist_id = pathologist_id
    if not db_obj.cytotechnologist_id:
        db_obj.cytotechnologist_id = current_user_id
    db_obj.is_screened = True
    if db_obj.screened_at is None:
        db_obj.screened_at = local_now()
    if status_override:
        db_obj.status = status_override

    if signers is not None:
        current_diag = (
            db.query(NongyneDiagnosis)
            .filter(
                NongyneDiagnosis.case_id == case_id,
                NongyneDiagnosis.is_current.is_(True),
            )
            .first()
        )
        if current_diag:
            current_diag.signers = signers
            db.add(current_diag)

    db.add(db_obj)
    db.flush()

    cyto_path_qc.safe_capture_screening(
        db, case_type="nongyne", case=db_obj, cytotech_id=db_obj.cytotechnologist_id
    )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return (
        db.query(NongyneCytologyCase)
        .options(
            selectinload(NongyneCytologyCase.patient).selectinload(Patient.title),
            selectinload(NongyneCytologyCase.hospital),
            selectinload(NongyneCytologyCase.pathologist),
            selectinload(NongyneCytologyCase.cytotechnologist),
        )
        .filter(NongyneCytologyCase.id == case_id)
        .first()
    )


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


def cancel_nongyne_case(db: Session, case_id: int, user_id: int, reason: str):
    db_obj = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()

    if not db_obj:
        return None

    db_obj.is_cancelled = True
    db_obj.status = "cancelled"
    db_obj.cancelled_at = func.now()
    db_obj.cancelled_by_id = user_id
    db_obj.cancel_reason = reason

    try:
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
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

    comment_rows = (
        db.query(NongyneCytologyCase)
        .filter(
            func.date(NongyneCytologyCase.registered_at) >= start_date,
            func.date(NongyneCytologyCase.registered_at) <= end_date,
            NongyneCytologyCase.quality_comment.isnot(None),
            func.trim(NongyneCytologyCase.quality_comment) != "",
        )
        .order_by(NongyneCytologyCase.registered_at.desc())
        .all()
    )

    return {
        "total": total,
        "slide_quality": slide,
        "stain_quality": stain,
        "comments": [
            {
                "case_id": c.id,
                "accession_no": c.accession_no,
                "registered_at": c.registered_at.isoformat() if c.registered_at else None,
                "slide_quality": c.slide_quality,
                "stain_quality": c.stain_quality,
                "comment": c.quality_comment,
            }
            for c in comment_rows
        ],
    }


# =====================================================================
# Specimen Disposal — รายการเคสสำหรับหน้าทิ้งสิ่งส่งตรวจ
#
# ต่างจาก surgical (get_stored_cases) ตรงที่ไม่มีขั้นตอนจัดเก็บเข้ากล่อง
# เกณฑ์ว่าทิ้งได้หรือยังจึงมาจากวันที่รายงานผลล้วน ๆ และคำนวณใน SQL
# ไม่ใช่ใน Python หลัง query เพราะ count()/pagination ต้องนับชุดเดียวกัน
# =====================================================================

DISPOSAL_BUCKETS = ("due", "not_due", "blocked")


def _days_since_report_expr():
    """จำนวนวันนับจากวันรายงานผลถึงวันนี้ แบบนับเป็นวันปฏิทิน

    cast เป็น DATE ทั้งสองข้างก่อนลบ (Postgres คืน integer) เพื่อให้ได้เลขเดียวกับ
    (today - report_at.date()).days ฝั่ง Python — ถ้าใช้ now() - report_at ตรง ๆ
    รายงานที่ออกเมื่อ 23:00 เมื่อวานจะนับเป็น 0 วัน
    """
    return cast(literal(local_now()), Date) - cast(NongyneCytologyCase.report_at, Date)


def _disposal_base_query(db: Session, search: str = None):
    query = db.query(NongyneCytologyCase).filter(
        NongyneCytologyCase.is_cancelled.is_(False),
        NongyneCytologyCase.discard_status.is_(False),
    )
    if search:
        s = f"%{search}%"
        query = query.join(
            Patient, NongyneCytologyCase.patient_id == Patient.id
        ).filter(
            or_(
                NongyneCytologyCase.accession_no.ilike(s),
                NongyneCytologyCase.hn.ilike(s),
                Patient.name.ilike(s),
                Patient.ln.ilike(s),
            )
        )
    return query


def _reported_filters():
    """เคสที่ออกผลจริงแล้วเท่านั้นจึงจะเข้าคิวทิ้งได้

    เคสที่ยังไม่ published ไม่โผล่ในหน้านี้เลย — มันยังเป็นงานของ worklist วินิจฉัย
    """
    return (
        NongyneCytologyCase.status == "published",
        NongyneCytologyCase.report_at.is_not(None),
        NongyneCytologyCase.is_pending.is_(False),
    )


def get_disposal_candidates(
    db: Session,
    *,
    bucket: str = "due",
    skip: int = 0,
    limit: int = 20,
    search: str = None,
    retention_days: int = 30,
) -> dict:
    """เคสที่รอทิ้ง แยกเป็น 3 ถัง

    due      = ออกผลแล้วครบ retention_days วัน ไม่ค้าง pending และยังไม่อยู่ในใบที่เปิดค้าง
    not_due  = ออกผลแล้วแต่ยังไม่ครบกำหนด
    blocked  = ค้าง pending อยู่ (ทุก status) — ไว้ให้แลปตามเก็บ
    """
    from app.crud.nongyne_specimen_disposal_batch import open_batch_case_ids_subquery

    if bucket not in DISPOSAL_BUCKETS:
        bucket = "due"

    age = _days_since_report_expr()
    query = _disposal_base_query(db, search)

    if bucket == "blocked":
        query = query.filter(NongyneCytologyCase.is_pending.is_(True))
        order_col = NongyneCytologyCase.registered_at.asc()
    else:
        query = query.filter(*_reported_filters())
        if bucket == "due":
            query = query.filter(age >= retention_days).filter(
                ~NongyneCytologyCase.id.in_(open_batch_case_ids_subquery())
            )
        else:
            query = query.filter(age < retention_days)
        # ของเก่าสุดขึ้นก่อน — คนทำงานไล่ทิ้งจากที่ค้างนานที่สุด
        order_col = NongyneCytologyCase.report_at.asc()

    total = query.count()
    items = (
        query.options(
            selectinload(NongyneCytologyCase.patient).selectinload(Patient.title),
            selectinload(NongyneCytologyCase.specimen_disposer),
        )
        .order_by(order_col)
        .offset(skip)
        .limit(limit)
        .all()
    )

    today = local_now().date()
    for case in items:
        days = (today - case.report_at.date()).days if case.report_at else None
        case.days_since_report = days
        case.is_due = bucket == "due"
        case.block_reason = _disposal_block_reason(case, days, retention_days)

    return {"items": items, "total": total, "retention_days": retention_days}


def _disposal_block_reason(case, days, retention_days) -> str | None:
    """เหตุผลที่ยังทิ้งไม่ได้ — ข้อความเดียวกับที่ create_batch จะปฏิเสธ"""
    if case.is_pending:
        return f"ค้าง Pending{f' ({case.pending_reason})' if case.pending_reason else ''}"
    if case.status != "published" or not case.report_at:
        return "ยังไม่ได้รายงานผล"
    if days is not None and days < retention_days:
        return f"ยังไม่ครบ {retention_days} วันหลังรายงานผล (ครบแล้ว {days} วัน)"
    return None


def get_disposed_nongyne_cases(
    db: Session, skip: int = 0, limit: int = 20, search: str = None
) -> dict:
    query = db.query(NongyneCytologyCase).filter(
        NongyneCytologyCase.discard_status.is_(True)
    )
    if search:
        s = f"%{search}%"
        query = query.join(
            Patient, NongyneCytologyCase.patient_id == Patient.id
        ).filter(
            or_(
                NongyneCytologyCase.accession_no.ilike(s),
                NongyneCytologyCase.hn.ilike(s),
                Patient.name.ilike(s),
                Patient.ln.ilike(s),
            )
        )

    total = query.count()
    items = (
        query.options(
            selectinload(NongyneCytologyCase.patient).selectinload(Patient.title),
            selectinload(NongyneCytologyCase.specimen_disposer),
        )
        .order_by(NongyneCytologyCase.discard_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    today = local_now().date()
    for case in items:
        case.days_since_report = (
            (today - case.report_at.date()).days if case.report_at else None
        )
        case.is_due = False
        case.block_reason = None

    return {"items": items, "total": total}
