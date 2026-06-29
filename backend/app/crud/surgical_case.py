import logging
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_, and_, exists, select
from fastapi import HTTPException, status
from datetime import datetime
from app.utils.time import local_now
from app.models.surgical_case import SurgicalCase

logger = logging.getLogger(__name__)
from app.models.surgical_specimen import SurgicalSpecimen
from app.schemas.surgical_case import SurgicalCaseCreate, SurgicalCaseUpdate
from app.models.patient import Patient
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_report import SurgicalReport, ReportSigner


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
                    **spec_in.model_dump(), case_id=db_case.id
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
    medical_scheme_id: int = None,
    has_gross_draft: bool = None,
    is_out_lab_consult: bool = None,
    consult_status: str = None,
    has_specimens: bool = None,
    date_from: datetime = None,
    date_to: datetime = None,
    is_pending: bool = None,
):
    query = db.query(SurgicalCase).join(Patient)

    # 1. กรองตาม Pathologist
    if pathologist_id is not None:
        query = query.filter(SurgicalCase.pathologist_id == pathologist_id)

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

    items = (
        query.options(
            selectinload(SurgicalCase.specimens).selectinload(
                SurgicalSpecimen.blocks
            )  # 🚩 โหลด Blocks ที่ซ้อนใน Specimens ออกมาด้วย
        )
        .order_by(SurgicalCase.accession_no.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {"items": items, "total": total}


def get_case(db: Session, case_id: int):
    return (
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
        )
        .filter(SurgicalCase.id == case_id)
        .first()
    )


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
    hospital_id: int = None,
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

    if hospital_id:
        query = query.filter(SurgicalCase.hospital_id == hospital_id)

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
    hospital_id: int = None,
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
        if hospital_id:
            q = q.filter(SurgicalCase.hospital_id == hospital_id)
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
        if hospital_id:
            q = q.filter(SurgicalReport.hospital_id == hospital_id)
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
    for case in cases:
        case.specimen_storage_status = "Stored"
        case.specimen_storage_container = container_number
        case.specimen_storage_at = now
        case.specimen_storage_by_id = user_id
        updated_cases.append(case)
        
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
    for case in cases:
        case.specimen_storage_status = "Discarded"
        case.discard_status = True
        case.discard_at = now
        case.discard_by_id = user_id
        updated_cases.append(case)
        
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

    for case in cases:
        cost_summary = get_case_cost_summary(db, case.id)
        case_total = cost_summary.get("grand_total", 0.0)
        case_items = cost_summary.get("items", [])
        
        patient_name = case.patient.name if case.patient else "Unknown"
        
        items.append({
            "case_id": case.id,
            "accession_no": case.accession_no,
            "hn": case.hn,
            "patient_name": patient_name,
            "status": case.status,
            "registered_at": case.registered_at,
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
