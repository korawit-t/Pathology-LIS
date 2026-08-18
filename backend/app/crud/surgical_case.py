import logging
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_, and_, exists, select, case
from fastapi import HTTPException, status
from datetime import datetime, date
from app.utils.time import local_now
from app.models.surgical_case import SurgicalCase

logger = logging.getLogger(__name__)
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_stain import SurgicalBlockStain
from app.schemas.surgical_case import SurgicalCaseCreate, SurgicalCaseUpdate
from app.models.patient import Patient
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_report import SurgicalReport, ReportSigner
from app.models.anatomical_pathology_test import AnatomicalPathologyTest


def _get_next_accession_no(db: Session) -> str:
    from app.models.system_setting import SystemSetting
    current_year_short = local_now().strftime("%y")
    settings = db.query(SystemSetting).first()
    letter = (settings.surgical_accession_prefix or "S") if settings else "S"
    prefix = f"{letter}{current_year_short}-"

    # 🔍 with_for_update() ถูกต้องแล้ว เพื่อป้องกัน Race Condition ตอนเจนเลขพร้อมกัน
    last_case = (
        db.query(SurgicalCase.accession_no)
        .filter(SurgicalCase.accession_no.like(f"{prefix}%"))
        .order_by(SurgicalCase.accession_no.desc())
        .with_for_update()
        .first()
    )

    if last_case:
        last_no = last_case[0]
        # จัดการกรณี format ผิดพลาดด้วย try-except หรือ split อย่างระมัดระวัง
        try:
            new_run_number = int(last_no.split("-")[1]) + 1
        except (IndexError, ValueError):
            new_run_number = 1
    else:
        new_run_number = 1

    return f"{prefix}{new_run_number:05d}"


def create_case_with_specimens(
    db: Session, case_in: SurgicalCaseCreate, registrar_id: int
):
    try:
        # 1. เจนเลข Accession Number (ล็อค Row จนกว่าจะ commit)
        new_accession_no = _get_next_accession_no(db)

        # 2. เตรียมข้อมูล Case (ถอด specimens ออกก่อนสร้าง)
        case_dict = case_in.model_dump(exclude={"specimens", "registrar_id"})
        db_case = SurgicalCase(
            **case_dict,
            accession_no=new_accession_no,
            registrar_id=registrar_id,
        )

        db.add(db_case)
        db.flush()  # ยิง SQL เข้าไปเพื่อเอา db_case.id แต่ยังไม่ยืนยัน Transaction

        # 3. สร้างรายการชิ้นเนื้อ (Specimens)
        if case_in.specimens:
            for spec_in in case_in.specimens:
                # สร้างชิ้นเนื้อโดยเชื่อม FK กลับมาที่ id ของ Case
                db_specimen = SurgicalSpecimen(
                    **spec_in.model_dump(exclude={"surgical_case_id"}), case_id=db_case.id
                )
                db.add(db_specimen)

        # 4. ยืนยันข้อมูลทั้งหมดลง DB
        db.commit()

        # 5. โหลดข้อมูลกลับมาพร้อมลูกๆ (Eager Loading) เพื่อส่งคืนให้ Schema
        return (
            db.query(SurgicalCase)
            .options(
                selectinload(SurgicalCase.specimens),
                selectinload(SurgicalCase.pathologist),  # โหลดข้อมูลหมอผู้รับผิดชอบกลับไปด้วย
            )
            .filter(SurgicalCase.id == db_case.id)
            .first()
        )

    except Exception as e:
        db.rollback()
        raise e


def get_cases(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    search: str = None,
    pathologist_id: int = None,
    status: any = None,
    hospital_id: int = None,
    hospital_ids: list = None,
    medical_scheme_id: int = None,
    has_gross_draft: bool = None,
    is_out_lab_consult: bool = None,
    consult_status: str = None,
    has_specimens: bool = None,
    date_from: datetime = None,
    date_to: datetime = None,
    is_pending: bool = None,
    is_express: bool = None,
    exclude_signed: bool = None,
    prioritize_status: str = None,
):
    query = db.query(SurgicalCase).join(Patient)

    # 1. กรองตาม Pathologist
    if pathologist_id is not None:
        query = query.filter(SurgicalCase.pathologist_id == pathologist_id)

    if is_express is not None:
        query = query.filter(SurgicalCase.is_express == is_express)

    if exclude_signed:
        query = query.filter(
            ~SurgicalCase.status.in_(["signed out", "addendum signed"])
        )

    # 2. Status filter — when is_pending=True, OR with the is_pending flag
    status_conds = []
    if status and str(status).upper() != "ALL":
        if isinstance(status, list):
            status_conds.append(SurgicalCase.status.in_(status))
        else:
            status_conds.append(SurgicalCase.status.ilike(status))
    if is_pending is True:
        status_conds.append(SurgicalCase.is_pending == True)
    if status_conds:
        query = query.filter(or_(*status_conds))

    # 3. กรองตามคำค้นหา
    if search:
        query = query.filter(
            (SurgicalCase.accession_no.ilike(f"%{search}%"))
            | (SurgicalCase.hn.ilike(f"%{search}%"))
            | (Patient.name.ilike(f"%{search}%"))
        )

    # 4. กรองตาม Hospital
    if hospital_id is not None:
        query = query.filter(SurgicalCase.hospital_id == hospital_id)
    elif hospital_ids is not None:
        query = query.filter(SurgicalCase.hospital_id.in_(hospital_ids))

    if medical_scheme_id is not None:
        query = query.filter(SurgicalCase.medical_scheme_id == medical_scheme_id)

    if date_from is not None:
        query = query.filter(SurgicalCase.registered_at >= date_from)
    if date_to is not None:
        query = query.filter(SurgicalCase.registered_at <= date_to)

    # 5. กรองแบบเคสที่บันทึกร่างเฉยๆ
    if has_gross_draft is True:
        query = query.filter(
            SurgicalCase.is_grossed == False,
            SurgicalCase.gross_at.isnot(None)
        )

    # 5. กรอง Out-Lab Consult status
    if is_out_lab_consult is not None:
        query = query.filter(SurgicalCase.is_out_lab_consult == is_out_lab_consult)
        
    if consult_status:
        statuses = [s.strip() for s in consult_status.split(",")] if "," in consult_status else None
        if statuses:
            query = query.filter(SurgicalCase.consult_status.in_(statuses))
        else:
            query = query.filter(SurgicalCase.consult_status == consult_status)

    if has_specimens is True:
        query = query.filter(
            exists().where(SurgicalSpecimen.case_id == SurgicalCase.id)
        )
    elif has_specimens is False:
        query = query.filter(
            ~exists().where(SurgicalSpecimen.case_id == SurgicalCase.id)
        )

    total = query.count()

    order_by_clauses = []
    if prioritize_status:
        order_by_clauses.append(
            case((SurgicalCase.status.ilike(prioritize_status), 0), else_=1)
        )
    order_by_clauses.append(SurgicalCase.accession_no.asc())

    items = (
        query.options(
            selectinload(SurgicalCase.specimens)
            .selectinload(SurgicalSpecimen.blocks)  # 🚩 โหลด Blocks ที่ซ้อนใน Specimens ออกมาด้วย
            .selectinload(SurgicalBlock.stains)
            .joinedload(SurgicalBlockStain.test)
        )
        .order_by(*order_by_clauses)
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Flag cases that have ever had an IHC stain ordered on any block — not a
    # stored column, computed from the already-eager-loaded specimens/blocks
    # so this stays a single query set, not one query per case.
    for item in items:
        item.has_ihc = any(
            stain.test and stain.test.category == "IHC"
            for spec in item.specimens
            for block in spec.blocks
            for stain in block.stains
        )

    return {"items": items, "total": total}


def get_case(db: Session, case_id: int):
    case = (
        db.query(SurgicalCase)
        .options(
            selectinload(SurgicalCase.specimens),
            selectinload(SurgicalCase.patient),
            selectinload(SurgicalCase.hospital),
            selectinload(SurgicalCase.pathologist),
            # 🚩 โหลด Reports พร้อมรายชื่อคนเซ็น (Workflow ใหม่)
            selectinload(SurgicalCase.reports)
            .selectinload(SurgicalReport.signers)
            .selectinload(ReportSigner.user),
            # 🚩 โหลด Diagnoses แบบคลีนๆ (ไม่มี pathologist_assignments แล้ว)
            selectinload(SurgicalCase.diagnoses),
            selectinload(SurgicalCase.consult_pdf_approver),
        )
        .filter(SurgicalCase.id == case_id)
        .first()
    )
    if case:
        # Not a stored column — computed display name for the consult-PDF
        # approver, mirrors the has_ihc computed-field pattern in get_cases().
        case.consult_pdf_approver_name = (
            (case.consult_pdf_approver.report_name or case.consult_pdf_approver.full_name)
            if case.consult_pdf_approver
            else None
        )
    return case


def delete_case(db: Session, case_id: int):
    # 1. ค้นหาเคส
    db_obj = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()

    if not db_obj:
        return None

    # 2. 🛡️ เช็คสถานะ: ถ้าไม่ใช่ Registered จะลบไม่ได้
    if db_obj.status != "registered":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete case in status: {db_obj.status}. Only 'registered' cases can be deleted.",
        )

    # 3. 🛡️ ดำเนินการลบจริง (Hard Delete)
    try:
        db.delete(db_obj)
        db.commit()
        return db_obj  # ส่งคืน object ที่ถูกลบไป (ข้อมูลยังอยู่ในหน่วยความจำชั่วคราว)

    except Exception as e:
        db.rollback()
        raise e


def cancel_surgical_case(db: Session, case_id: int, user_id: int, reason: str):
    db_obj = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()

    if not db_obj:
        return None

    # อัปเดตข้อมูลการยกเลิก
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


def request_out_lab_consult(db: Session, *, db_obj: SurgicalCase, reason: str):
    """Flag a case for out-lab consult without touching the report.

    The sign-off path (bulk_save_draft_orchestrator) sets the same three fields,
    but couples them to finalizing the report. This lets the pathologist queue a
    case for dispatch while the diagnosis is still a draft — the case then shows
    up in Out-Lab Consult → Send to Consult (which filters on
    is_out_lab_consult + consult_status="pending"), no sign-off required.
    """
    if db_obj.is_out_lab_consult and db_obj.consult_status in ("processing", "received"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Case has already been dispatched for out-lab consult.",
        )

    db_obj.is_out_lab_consult = True
    db_obj.consult_reason = reason
    if db_obj.consult_status is None:
        db_obj.consult_status = "pending"

    try:
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception:
        db.rollback()
        raise


def cancel_out_lab_consult(db: Session, *, db_obj: SurgicalCase):
    """Clear the out-lab consult flag — only while the case is still queued.

    Once a consult run has been created the case is physically out of the lab,
    so un-flagging is the Out-Lab module's job (cancelling the run), not this one.
    """
    if db_obj.consult_status in ("processing", "received"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Case has already been dispatched — cancel the consult run instead.",
        )

    db_obj.is_out_lab_consult = False
    db_obj.consult_status = None
    db_obj.consult_reason = None

    try:
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception:
        db.rollback()
        raise


def update_case(db: Session, *, db_obj: SurgicalCase, obj_in: SurgicalCaseUpdate):
    # ดึงเฉพาะฟิลด์ที่หน้าบ้านส่งมาจริงๆ
    update_data = obj_in.model_dump(exclude_unset=True)

    # รายการฟิลด์ที่ห้ามแก้เด็ดขาด
    readonly_fields = [
        "id",
        "accession_no",
        "registered_at",
        "registrar_id",
        "specimens",
    ]

    for key, value in update_data.items():
        if key not in readonly_fields:
            # 🌟 ตรวจสอบว่า db_obj มีฟิลด์นี้จริงไหมก่อน setattr
            if hasattr(db_obj, key):
                setattr(db_obj, key, value)
            else:
                logger.warning("Field '%s' not found in SurgicalCase model — skipped", key)

    try:
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        raise e


def search_public_cases_with_latest_report(
    db: Session,
    page: int = 1,
    size: int = 10,
    search: str = None,
    hospital_ids: list = None,
):
    # 1. Subquery หา ID รายงานล่าสุด (เหมือนเดิม)
    latest_report_ids = (
        select(func.max(SurgicalReport.id))
        .group_by(SurgicalReport.case_id)
        .scalar_subquery()
    )

    # 2. ปรับ Query: เพิ่ม .options(selectinload(SurgicalCase.specimens))
    # เพื่อให้ดึงข้อมูลชิ้นเนื้อออกมาใน Query เดียว (ป้องกัน N+1 Problem)
    query = (
        db.query(SurgicalCase, SurgicalReport)
        .outerjoin(
            SurgicalReport,
            and_(
                SurgicalCase.id == SurgicalReport.case_id,
                SurgicalReport.id.in_(latest_report_ids),
                SurgicalReport.status == "published",
            ),
        )
        .options(selectinload(SurgicalCase.specimens))
    )  # 🚩 โหลดลูกมาด้วย

    # 3. Join Patient เพื่อให้ค้นหาชื่อและดึงข้อมูลชื่อมาแสดงได้ชัวร์ๆ
    query = query.join(SurgicalCase.patient)

    if hospital_ids is not None:
        query = query.filter(SurgicalCase.hospital_id.in_(hospital_ids))

    if search:
        s = f"%{search}%"
        query = query.filter(
            or_(
                SurgicalCase.accession_no.ilike(s),
                SurgicalCase.hn.ilike(s),
                Patient.name.ilike(s),
            )
        )

    total = query.count()
    skip = (page - 1) * size
    results = query.order_by(SurgicalCase.id.desc()).offset(skip).limit(size).all()

    items = []
    for db_case, db_report in results:
        # 🚩 4. ดึง specimen_name มาต่อกันเป็นข้อความ
        # หรือจะส่งเป็น List [s.specimen_name for s in db_case.specimens] ก็ได้
        specimen_list = [s.specimen_name for s in db_case.specimens]
        specimen_text = ", ".join(specimen_list) if specimen_list else "-"

        # กำหนดสถานะที่จะแสดงผล
        # 1. ถ้ามี db_report แปลว่าเคสนี้ Join ติดรายงานล่าสุดที่สถานะเป็น 'published' แล้ว
        # 2. ให้ใช้สถานะ 'published' แทนค่าใน db_case.status ไปเลย
        display_status = "published" if db_report else db_case.status

        items.append(
            {
                "case_id": db_case.id,
                "report_id": db_report.id if db_report else None,
                "accession_no": db_case.accession_no,
                "patient_name": db_case.patient.name if db_case.patient else "Unknown",
                "patient_hn": db_case.hn,
                "specimen_name": specimen_text,
                "registered_at": db_case.registered_at,
                "is_express": db_case.is_express,
                "status": display_status,
                "published_at": db_report.published_at if db_report else None,
                "pathologist_name": db_report.pathologist_name if db_report else "-",
                "clinician_name": db_case.clinician_name or "-",
                "is_read": db_report.is_read if db_report else None,
                "read_at": db_report.read_at if db_report else None,
            }
        )

    return {"items": items, "total": total, "page": page, "size": size}


_IN_PROGRESS_STATUSES = {"registered", "grossed", "processed", "reported", "cancelled"}


def list_hospital_cases(
    db: Session,
    page: int = 1,
    size: int = 20,
    search: str = None,
    hospital_ids: list = None,
    status_filter: str = None,
    start_date: str = None,
    end_date: str = None,
):
    """
    Unified view across both tables:
      - surgical_report  → published cases (includes all historical migrated data)
      - surgical_case    → in-progress cases (new registrations, not yet published)
    In-progress cases are shown first; published fill the rest of each page.
    """
    from datetime import datetime

    want_published = not status_filter or status_filter == "published"
    want_live = not status_filter or status_filter in _IN_PROGRESS_STATUSES

    # ── 1. In-progress query (surgical_case, not yet published) ─────────────
    def _live_query():
        # Subquery: case_ids that already have a published report
        from sqlalchemy import select as sa_select
        published_case_ids = (
            sa_select(SurgicalReport.case_id)
            .where(SurgicalReport.status == "published")
            .scalar_subquery()
        )
        q = (
            db.query(SurgicalCase)
            .options(selectinload(SurgicalCase.specimens))
            .join(SurgicalCase.patient)
            .filter(SurgicalCase.id.notin_(published_case_ids))
        )
        if hospital_ids is not None:
            q = q.filter(SurgicalCase.hospital_id.in_(hospital_ids))
        if status_filter and status_filter in _IN_PROGRESS_STATUSES:
            q = q.filter(SurgicalCase.status == status_filter)
        if search:
            s = f"%{search}%"
            q = q.filter(
                or_(
                    SurgicalCase.accession_no.ilike(s),
                    SurgicalCase.hn.ilike(s),
                    Patient.name.ilike(s),
                )
            )
        if start_date:
            q = q.filter(SurgicalCase.registered_at >= datetime.fromisoformat(start_date))
        if end_date:
            q = q.filter(
                SurgicalCase.registered_at
                <= datetime.fromisoformat(end_date + "T23:59:59")
            )
        return q.order_by(SurgicalCase.id.desc())

    # ── 2. Published query (surgical_report, latest per case) ───────────────
    def _published_query():
        latest_subq = (
            db.query(func.max(SurgicalReport.id).label("max_id"))
            .group_by(SurgicalReport.case_id)
            .subquery()
        )
        q = (
            db.query(SurgicalReport)
            .join(latest_subq, SurgicalReport.id == latest_subq.c.max_id)
            .filter(SurgicalReport.status == "published")
        )
        if hospital_ids is not None:
            q = q.filter(SurgicalReport.hospital_id.in_(hospital_ids))
        if search:
            s = f"%{search}%"
            q = q.filter(
                or_(
                    SurgicalReport.accession_no.ilike(s),
                    SurgicalReport.patient_hn.ilike(s),
                    SurgicalReport.patient_name.ilike(s),
                )
            )
        if start_date:
            q = q.filter(SurgicalReport.registered_at >= datetime.fromisoformat(start_date))
        if end_date:
            q = q.filter(
                SurgicalReport.registered_at
                <= datetime.fromisoformat(end_date + "T23:59:59")
            )
        return q.order_by(SurgicalReport.id.desc())

    # ── 3. Counts ────────────────────────────────────────────────────────────
    live_total = _live_query().count() if want_live else 0
    pub_total = _published_query().count() if want_published else 0
    total = live_total + pub_total

    # ── 4. Paginate: in-progress first, then published ───────────────────────
    skip = (page - 1) * size
    items: list = []

    if want_live and live_total > 0 and skip < live_total:
        live_skip = skip
        live_limit = min(size, live_total - live_skip)
        for sc in _live_query().offset(live_skip).limit(live_limit).all():
            specimen_text = ", ".join(
                s.specimen_name for s in sc.specimens
            ) or "-"
            items.append({
                "case_id": sc.id,
                "report_id": None,
                "accession_no": sc.accession_no or "-",
                "patient_name": sc.patient.name if sc.patient else "Unknown",
                "patient_ln": sc.patient.ln if sc.patient else None,
                "patient_hn": sc.hn or "-",
                "specimen_name": specimen_text,
                "registered_at": sc.registered_at,
                "is_express": sc.is_express,
                "status": sc.status,
                "published_at": None,
                "pathologist_name": "-",
                "clinician_name": sc.clinician_name or "-",
                "is_read": False,
                "read_at": None,
            })

    remaining = size - len(items)
    if want_published and remaining > 0 and pub_total > 0:
        pub_skip = max(0, skip - live_total)
        for r in _published_query().offset(pub_skip).limit(remaining).all():
            items.append({
                "case_id": r.case_id,
                "report_id": r.id,
                "accession_no": r.accession_no or "-",
                "patient_name": r.patient_name or "Unknown",
                "patient_ln": r.patient_ln or None,
                "patient_hn": r.patient_hn or "-",
                "specimen_name": r.specimen_summary or "-",
                "registered_at": r.registered_at,
                "is_express": False,
                "status": "published",
                "published_at": r.published_at,
                "pathologist_name": r.pathologist_name or "-",
                "clinician_name": r.clinician_name or "-",
                "is_read": r.is_read,
                "read_at": r.read_at,
            })

    return {"items": items, "total": total, "page": page, "size": size}


def get_unstored_cases(db: Session):
    """
    ดึงรายการเคสที่รายงานผลเสร็จแล้ว หรือเลยขั้นตอน Gross ไปแล้ว แต่ยังไม่ได้ระบุที่เก็บชิ้นเนื้อ
    (ในที่นี้เราเอาแค่คนที่มี specimen_storage_status เป็น null/None)
    """
    query = (
        db.query(SurgicalCase)
        .options(selectinload(SurgicalCase.patient))
        .filter(
            SurgicalCase.status != "cancelled",
            SurgicalCase.specimen_storage_status.is_(None),
            SurgicalCase.is_out_lab_consult == False,
        )
        .order_by(SurgicalCase.id.desc())
    )
    return query.all()

def get_stored_cases(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: str = None
):
    query = (
        db.query(SurgicalCase)
        .options(
            selectinload(SurgicalCase.patient),
            selectinload(SurgicalCase.specimen_storer),
            selectinload(SurgicalCase.specimen_disposer)
        )
        .filter(
            SurgicalCase.status != "cancelled",
            SurgicalCase.specimen_storage_status.is_not(None),
            SurgicalCase.discard_status == False
        )
    )
    
    if search:
        query = query.filter(
            or_(
                SurgicalCase.accession_no.ilike(f"%{search}%"),
                SurgicalCase.hn.ilike(f"%{search}%"),
                SurgicalCase.specimen_storage_container.ilike(f"%{search}%"),
                Patient.name.ilike(f"%{search}%")
            )
        )
        
    total = query.count()
    items = query.order_by(SurgicalCase.id.desc()).offset(skip).limit(limit).all()
    
    return {"items": items, "total": total}

def get_disposed_cases(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    search: str = None
):
    query = (
        db.query(SurgicalCase)
        .options(
            selectinload(SurgicalCase.patient),
            selectinload(SurgicalCase.specimen_storer),
            selectinload(SurgicalCase.specimen_disposer)
        )
        .filter(
            SurgicalCase.status != "cancelled",
            SurgicalCase.discard_status == True
        )
    )
    
    if search:
        query = query.filter(
            or_(
                SurgicalCase.accession_no.ilike(f"%{search}%"),
                SurgicalCase.hn.ilike(f"%{search}%"),
                SurgicalCase.specimen_storage_container.ilike(f"%{search}%"),
                Patient.name.ilike(f"%{search}%")
            )
        )
        
    total = query.count()
    items = query.order_by(SurgicalCase.discard_at.desc(), SurgicalCase.id.desc()).offset(skip).limit(limit).all()
    
    return {"items": items, "total": total}

def bulk_update_storage_status(db: Session, case_ids: list[int], container_number: str, user_id: int):
    cases = db.query(SurgicalCase).filter(SurgicalCase.id.in_(case_ids)).all()
    updated_cases = []
    
    now = local_now()
    for c in cases:
        c.specimen_storage_status = "Stored"
        c.specimen_storage_container = container_number
        c.specimen_storage_at = now
        c.specimen_storage_by_id = user_id
        updated_cases.append(c)
        
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise e
        
    return updated_cases

def bulk_dispose_storage(db: Session, case_ids: list[int], user_id: int):
    cases = db.query(SurgicalCase).filter(SurgicalCase.id.in_(case_ids)).all()
    updated_cases = []
    
    now = local_now()
    for c in cases:
        c.specimen_storage_status = "Discarded"
        c.discard_status = True
        c.discard_at = now
        c.discard_by_id = user_id
        updated_cases.append(c)
        
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise e
        
    return updated_cases

def get_case_cost_summary(db: Session, case_id: int):
    # 1. ค้นหา Specimen id และ Block id ทั้งหมดของ Case นี้
    from app.models.surgical_block import SurgicalBlock
    from app.models.surgical_specimen import SurgicalSpecimen
    from app.models.surgical_block_stain import SurgicalBlockStain
    from app.models.surgical_specimen_ap_test import SurgicalSpecimenAPTest
    from app.models.anatomical_pathology_test import AnatomicalPathologyTest
    from collections import defaultdict

    specimens = db.query(SurgicalSpecimen.id).filter(SurgicalSpecimen.case_id == case_id).all()
    specimen_ids = [s[0] for s in specimens]

    if not specimen_ids:
        return {"items": [], "grand_total": 0.0}

    blocks = (
        db.query(SurgicalBlock.id)
        .filter(SurgicalBlock.specimen_id.in_(specimen_ids))
        .all()
    )
    block_ids = [b[0] for b in blocks]

    test_counts = defaultdict(int)

    # 2. ค้นหารายการ Specimen Test (เช่น ค่าบริการผ่าตัดก้อนเนื้อ)
    specimen_tests = (
        db.query(SurgicalSpecimenAPTest.ap_test_id, func.count(SurgicalSpecimenAPTest.id).label("quantity"))
        .filter(SurgicalSpecimenAPTest.surgical_specimen_id.in_(specimen_ids))
        .group_by(SurgicalSpecimenAPTest.ap_test_id)
        .all()
    )
    for test_id, qty in specimen_tests:
        if test_id:
            test_counts[test_id] += qty

    # 3. ค้นหารายการ Stain ทั้งหมดที่ไม่ได้ถูกยกเลิก (ในที่นี้คือ status != 'cancelled' ถ้ามี หรือนับหมด)
    if block_ids:
        stains = (
            db.query(SurgicalBlockStain.test_id, func.count(SurgicalBlockStain.id).label("quantity"))
            .filter(SurgicalBlockStain.block_id.in_(block_ids))
            .filter(SurgicalBlockStain.status != "cancelled")  # สมมติว่ามีสถานะ cancelled
            .group_by(SurgicalBlockStain.test_id)
            .all()
        )
        for test_id, qty in stains:
            if test_id:
                test_counts[test_id] += qty

    items = []
    grand_total = 0.0

    # 4. ดึงข้อมูล Master Test และคำนวณราคา
    test_ids = list(test_counts.keys())
    if test_ids:
        tests = db.query(AnatomicalPathologyTest).filter(AnatomicalPathologyTest.id.in_(test_ids)).all()
        test_info_map = {t.id: t for t in tests}

        for test_id, quantity in test_counts.items():
            test_info = test_info_map.get(test_id)
            if not test_info:
                continue

            unit_price = test_info.price_tier_1 or 0.0
            total_price = unit_price * quantity
            
            items.append({
                "test_id": test_info.id,
                "test_name": test_info.name,
                "category": test_info.category,
                "quantity": quantity,
                "unit_price": unit_price,
                "total_price": total_price
            })
            grand_total += total_price

    # Sort items by category
    items.sort(key=lambda x: (x["category"], x["test_name"]))

    return {"items": items, "grand_total": grand_total}


def get_hospital_billing_summary(
    db: Session,
    start_date: datetime,
    end_date: datetime,
    hospital_id: int = None
):
    query = (
        db.query(SurgicalCase)
        .options(selectinload(SurgicalCase.patient))
        .filter(
            SurgicalCase.registered_at >= start_date,
            SurgicalCase.registered_at <= end_date,
            SurgicalCase.status != "cancelled"
        )
    )

    if hospital_id:
        query = query.filter(SurgicalCase.hospital_id == hospital_id)

    cases = query.order_by(SurgicalCase.registered_at.asc()).all()

    items = []
    all_cases_grand_total = 0.0

    for c in cases:
        cost_summary = get_case_cost_summary(db, c.id)
        case_total = cost_summary.get("grand_total", 0.0)
        case_items = cost_summary.get("items", [])

        patient_name = c.patient.name if c.patient else "Unknown"

        items.append({
            "case_id": c.id,
            "accession_no": c.accession_no,
            "hn": c.hn,
            "patient_name": patient_name,
            "status": c.status,
            "registered_at": c.registered_at,
            "items": case_items,
            "grand_total": case_total
        })
        all_cases_grand_total += case_total

    return {
        "items": items,
        "total_cases": len(items),
        "all_cases_grand_total": all_cases_grand_total
    }



def get_dashboard_summary(db: Session) -> dict:
    from datetime import timedelta
    from app.models.system_setting import SystemSetting

    setting = db.query(SystemSetting).first()
    tat_days = int((setting.surgical_tat_days or 10) if setting else 10)
    express_tat_days = int((setting.surgical_express_tat_days or 3) if setting else 3)

    TERMINAL = ["signed out", "cancelled", "addendum signed"]
    PIPELINE = [
        "registered", "formalin_fixing", "in progress", "grossed",
        "processed", "embedded", "stained", "slide sent",
        "pending diagnosis", "pending special stains", "pending immuno",
        "pending peer review",
    ]

    # 1. Pipeline counts per status (single GROUP BY query)
    rows = (
        db.query(SurgicalCase.status, func.count(SurgicalCase.id))
        .filter(SurgicalCase.status.in_(PIPELINE))
        .group_by(SurgicalCase.status)
        .all()
    )
    pipeline = {r[0]: r[1] for r in rows}

    # 2. TAT — overdue (routine + express combined, grouped by status)
    now = local_now()
    overdue_dt = now - timedelta(days=tat_days)
    warning_dt = now - timedelta(days=int(tat_days * 0.75))
    express_overdue_dt = now - timedelta(days=express_tat_days)

    overdue_rows = (
        db.query(SurgicalCase.status, func.count(SurgicalCase.id))
        .filter(
            ~SurgicalCase.status.in_(TERMINAL),
            SurgicalCase.is_express == False,
            SurgicalCase.registered_at < overdue_dt,
        )
        .group_by(SurgicalCase.status)
        .all()
    )
    express_rows = (
        db.query(SurgicalCase.status, func.count(SurgicalCase.id))
        .filter(
            ~SurgicalCase.status.in_(TERMINAL),
            SurgicalCase.is_express == True,
            SurgicalCase.registered_at < express_overdue_dt,
        )
        .group_by(SurgicalCase.status)
        .all()
    )
    overdue_by_status: dict = {}
    for r in overdue_rows:
        overdue_by_status[r[0]] = overdue_by_status.get(r[0], 0) + r[1]
    for r in express_rows:
        overdue_by_status[r[0]] = overdue_by_status.get(r[0], 0) + r[1]

    # 3. TAT — warning (within 75%-100% of SLA, not yet overdue)
    warning_rows = (
        db.query(SurgicalCase.status, func.count(SurgicalCase.id))
        .filter(
            ~SurgicalCase.status.in_(TERMINAL),
            SurgicalCase.is_express == False,
            SurgicalCase.registered_at >= overdue_dt,
            SurgicalCase.registered_at < warning_dt,
        )
        .group_by(SurgicalCase.status)
        .all()
    )
    warning_by_status = {r[0]: r[1] for r in warning_rows}

    return {
        "pipeline": pipeline,
        "tat_overdue": {
            "total": sum(overdue_by_status.values()),
            "by_status": overdue_by_status,
        },
        "tat_warning": {
            "total": sum(warning_by_status.values()),
            "by_status": warning_by_status,
        },
        "tat_settings": {
            "routine_days": tat_days,
            "express_days": express_tat_days,
        },
    }


def get_workload_summary(db: Session, date_from=None, date_to=None, pathologist_id: int = None) -> dict:
    """Workload statistics: cases, blocks, stain counts, consults — filtered by registration date.
    Pass pathologist_id to restrict to a specific pathologist's personal workload."""
    from datetime import time

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


def get_workload_daily(db: Session, date_from=None, date_to=None, pathologist_id: int = None) -> list:
    """Per-day workload breakdown for chart display."""
    from datetime import time, timedelta

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


def get_workload_ihc_top(db: Session, date_from=None, date_to=None, pathologist_id: int = None, limit: int = 10) -> list:
    """Top N IHC markers ordered by a pathologist in the given date range."""
    from datetime import time

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


def get_immuno_stats(db: Session) -> dict:
    """Count distinct cases with pending IHC or Special Stain block stains."""
    from app.models.molecular_case import MolecularCase

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
        "pending_molecular_outlab": (
            db.query(func.count(MolecularCase.id))
            .filter(MolecularCase.status == "pending", MolecularCase.is_cancelled == False)  # noqa: E712
            .scalar()
            or 0
        ),
    }


def get_cancer_registry_summary(db: Session, date_from=None, date_to=None) -> dict:
    """Cancer registry: malignancy counts by month and by specimen name."""
    from collections import defaultdict
    from datetime import time

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


def get_slide_quality_stats(db: Session, start_date: str, end_date: str) -> dict:
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

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

    comment_rows = (
        db.query(SurgicalCase)
        .filter(
            SurgicalCase.is_cancelled == False,
            func.date(SurgicalCase.registered_at) >= start,
            func.date(SurgicalCase.registered_at) <= end,
            SurgicalCase.quality_comment.isnot(None),
            func.trim(SurgicalCase.quality_comment) != "",
        )
        .order_by(SurgicalCase.registered_at.desc())
        .all()
    )

    return {
        "total": sum(result.values()),
        "slide_quality": result,
        "stain_quality": None,
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


def _tat_bucket(tat_days: float) -> str:
    """Shared by get_tat_stats and get_tat_cases — previously each
    reimplemented this boundary rule independently (a drift risk if one
    were ever edited without the other)."""
    if tat_days < 3:
        return "lt3"
    elif tat_days < 5:
        return "t3_5"
    elif tat_days <= 10:
        return "t5_10"
    return "gt10"


def get_tat_stats(db: Session, date_from=None, date_to=None, pathologist_id: int = None) -> dict:
    """TAT statistics: average business days (weekends/holidays excluded), distribution buckets, monthly breakdown."""
    from collections import defaultdict
    from datetime import time
    from app.models.system_setting import SystemSetting
    from app.utils.tat import get_holiday_dates, business_days_between

    setting = db.query(SystemSetting).first()
    target_days = (setting.surgical_tat_days if setting else None) or 10
    express_target_days = (setting.surgical_express_tat_days if setting else None) or 3
    holidays = get_holiday_dates(db)

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
        tat = business_days_between(c.registered_at, c.report_at, holidays)
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
            d[_tat_bucket(tat)] += 1

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


def get_tat_cases(db: Session, bucket: str, date_from=None, date_to=None, pathologist_id: int = None, is_express: bool = None) -> list:
    """List cases (accession_no, patient, tat days) belonging to a TAT distribution bucket."""
    from datetime import time
    from app.models.patient import Patient
    from app.utils.tat import get_holiday_dates, business_days_between

    holidays = get_holiday_dates(db)

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
    if is_express is not None:
        filters.append(SurgicalCase.is_express == is_express)

    cases = (
        db.query(SurgicalCase)
        .join(Patient)
        .filter(*filters)
        .order_by(SurgicalCase.registered_at.desc())
        .all()
    )

    result = []
    for c in cases:
        tat = business_days_between(c.registered_at, c.report_at, holidays)
        if _tat_bucket(tat) != bucket:
            continue
        result.append(
            {
                "id": c.id,
                "accession_no": c.accession_no,
                "patient_title": c.patient.title.title if c.patient and c.patient.title else None,
                "patient_name": c.patient.name if c.patient else "Unknown",
                "patient_ln": c.patient.ln if c.patient else None,
                "registered_at": c.registered_at,
                "report_at": c.report_at,
                "tat_days": round(tat, 1),
                "is_express": c.is_express,
            }
        )

    return result
