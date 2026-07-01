from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import func, or_, cast, and_, literal
from fastapi import HTTPException, status
from datetime import datetime
from app.utils.time import local_now
from app.models.gyne_cyto_case import GyneCytologyCase  # ตรวจสอบชื่อ Model ในโปรเจกต์คุณ
from app.models.patient import Patient
from app.models.gyne_diagnosis import GyneDiagnosis
from app.models.gyne_cyto_report import GyneCytoReport, GyneReportStatus
from app.schemas.gyne_cyto_case import GyneCytologyCaseCreate, GyneCytologyCaseUpdate
from app.crud.gyne_cyto_stain import auto_create_default_stain


def _get_next_gyne_accession_no(db: Session) -> str:
    from app.models.system_setting import SystemSetting
    current_year_short = local_now().strftime("%y")
    settings = db.query(SystemSetting).first()
    letter = (settings.gyne_accession_prefix or "C") if settings else "C"
    prefix = f"{letter}{current_year_short}-"

    # ใช้ with_for_update() เพื่อป้องกันเลขซ้ำหากมีการกด Save พร้อมกัน
    last_case = (
        db.query(GyneCytologyCase.accession_no)
        .filter(GyneCytologyCase.accession_no.like(f"{prefix}%"))
        .order_by(GyneCytologyCase.accession_no.desc())
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


def create_gyne_case(db: Session, obj_in: GyneCytologyCaseCreate, registrar_id: int):
    try:
        new_accession_no = _get_next_gyne_accession_no(db)
        case_data = obj_in.model_dump(exclude={"accession_no", "registrar_id"})

        db_obj = GyneCytologyCase(
            **case_data,
            accession_no=new_accession_no,
            registrar_id=registrar_id,
            status="registered",
        )

        db.add(db_obj)
        db.commit()

        # 🚩 หัวใจสำคัญอยู่ตรงนี้ครับ:
        # แทนที่จะ refresh เฉยๆ ให้เรา Query ดึงข้อมูลใหม่พร้อมโหลดตารางที่เกี่ยวข้อง (Eager Loading)
        full_case = (
            db.query(GyneCytologyCase)
            .options(
                selectinload(GyneCytologyCase.hospital),
                selectinload(GyneCytologyCase.patient).selectinload(Patient.title),
                selectinload(GyneCytologyCase.department),
                selectinload(GyneCytologyCase.medical_scheme),
            )
            .filter(GyneCytologyCase.id == db_obj.id)
            .first()
        )

        # สร้างสไลด์อัตโนมัติ
        auto_create_default_stain(db, case_id=db_obj.id)

        return full_case  # ส่งก้อนที่ "อิ่มตัว" แล้วกลับไปให้ Frontend

    except Exception as e:
        db.rollback()
        raise e


def get_gyne_case(db: Session, case_id: int):
    """
    ดึงข้อมูลเคสเดียว พร้อมโหลดข้อมูลที่เกี่ยวข้องทั้งหมด (Eager Loading)
    """
    return (
        db.query(GyneCytologyCase)
        .options(
            selectinload(GyneCytologyCase.patient).selectinload(Patient.title),
            selectinload(GyneCytologyCase.registerer),
            selectinload(GyneCytologyCase.cytotechnologist),
            selectinload(GyneCytologyCase.pathologist),
            selectinload(GyneCytologyCase.hospital),
            selectinload(GyneCytologyCase.department),
            selectinload(GyneCytologyCase.medical_scheme),
        )
        .filter(GyneCytologyCase.id == case_id)
        .first()
    )


def get_gyne_cases(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    search: str = None,
    status: str = None,
    assigned_user_id: int = None,
    signer_id: int = None,
    exclude_status: str = None,
    exclude_signed_by: int = None,
    signed_by: int = None,
    hospital_id: int = None,
    is_out_lab_consult: bool = None,
    is_out_lab: bool = None,
    consult_status: str = None,
    is_reported: bool = None,
    date_from: datetime = None,
    date_to: datetime = None,
    review_reason: str = None,
    is_reviewed: bool = None,
):
    query = db.query(GyneCytologyCase).join(Patient)

    # 🚩 กรองตามคนรับผิดชอบเคส (Pathologist OR Cytotechnologist)
    if assigned_user_id:
        query = query.filter(
            or_(
                GyneCytologyCase.pathologist_id == assigned_user_id,
                GyneCytologyCase.cytotechnologist_id == assigned_user_id
            )
        )

    # 🚩 New: Filter by Co-Signer
    if signer_id:
        # Join with GyneDiagnosis
        query = query.join(GyneDiagnosis, GyneCytologyCase.id == GyneDiagnosis.case_id)
        
        # Filter where signers list contains user_id == signer_id
        # We assume PostgreSQL and use JSONB containment
        query = query.filter(
            GyneDiagnosis.is_current.is_(True),
            # Cast existing JSON column to JSONB for operator support if needed
            # The list [{"user_id": X}] is used for containment check
            cast(GyneDiagnosis.signers, JSONB).contains([{"user_id": signer_id}])
        )

    if exclude_signed_by:
        signed_case_ids = (
            db.query(GyneDiagnosis.case_id)
            .filter(
                GyneDiagnosis.is_current.is_(True),
                func.jsonb_path_exists(
                    cast(GyneDiagnosis.signers, JSONB),
                    literal(f'$[*] ? (@.user_id == {int(exclude_signed_by)} && @.signed_at != null)')
                )
            )
        )
        query = query.filter(~GyneCytologyCase.id.in_(signed_case_ids))

    if signed_by:
        signed_case_ids = (
            db.query(GyneDiagnosis.case_id)
            .filter(
                GyneDiagnosis.is_current.is_(True),
                func.jsonb_path_exists(
                    cast(GyneDiagnosis.signers, JSONB),
                    literal(f'$[*] ? (@.user_id == {int(signed_by)} && @.signed_at != null)')
                )
            )
        )
        query = query.filter(GyneCytologyCase.id.in_(signed_case_ids))

    if status and status.upper() != "ALL":
        if status.lower() == "screened":
            query = query.filter(GyneCytologyCase.is_screened.is_(True))
        else:
            query = query.filter(GyneCytologyCase.status == status.lower())

    if exclude_status:
        query = query.filter(GyneCytologyCase.status != exclude_status.lower())

    # 3. ค้นหาแบบ Global Search (Accession No, HN, Name)
    if search:
        s = f"%{search}%"
        query = query.filter(
            or_(
                GyneCytologyCase.accession_no.ilike(s),
                GyneCytologyCase.hn.ilike(s),
                Patient.name.ilike(s),
            )
        )

    if hospital_id is not None:
        query = query.filter(GyneCytologyCase.hospital_id == hospital_id)

    if is_out_lab_consult is not None:
        query = query.filter(GyneCytologyCase.is_out_lab_consult == is_out_lab_consult)

    if is_out_lab is not None:
        query = query.filter(GyneCytologyCase.is_out_lab == is_out_lab)

    if consult_status:
        query = query.filter(GyneCytologyCase.consult_status == consult_status)

    if is_reported is not None:
        query = query.filter(GyneCytologyCase.is_reported == is_reported)

    if date_from is not None:
        query = query.filter(GyneCytologyCase.registered_at >= date_from)
    if date_to is not None:
        query = query.filter(GyneCytologyCase.registered_at <= date_to)

    if review_reason:
        if review_reason == "any":
            query = query.filter(GyneCytologyCase.review_reason.isnot(None))
        else:
            query = query.filter(GyneCytologyCase.review_reason == review_reason)

    if is_reviewed is not None:
        if is_reviewed:
            query = query.filter(GyneCytologyCase.review_result.isnot(None))
        else:
            query = query.filter(GyneCytologyCase.review_result.is_(None))

    total = query.count()

    # 🚩 ใช้ selectinload เพื่อดึงข้อมูลที่เกี่ยวข้องมาให้ครบใน Query เดียว
    items = (
        query.options(
            selectinload(GyneCytologyCase.patient).selectinload(Patient.title),
            selectinload(GyneCytologyCase.pathologist),
            selectinload(GyneCytologyCase.cytotechnologist),
            selectinload(GyneCytologyCase.hospital),
            selectinload(GyneCytologyCase.department),
            selectinload(GyneCytologyCase.medical_scheme),
        )
        .order_by(GyneCytologyCase.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Attach latest published report id and is_read to each case
    if items:
        case_ids = [c.id for c in items]
        subq = (
            db.query(
                GyneCytoReport.case_id,
                func.max(GyneCytoReport.id).label("max_id"),
            )
            .filter(
                GyneCytoReport.case_id.in_(case_ids),
                GyneCytoReport.status == GyneReportStatus.PUBLISHED,
            )
            .group_by(GyneCytoReport.case_id)
            .subquery()
        )
        latest = (
            db.query(GyneCytoReport.case_id, GyneCytoReport.id, GyneCytoReport.is_read, GyneCytoReport.read_at)
            .join(subq, and_(GyneCytoReport.case_id == subq.c.case_id, GyneCytoReport.id == subq.c.max_id))
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
        corr_ids = set(
            row[0] for row in db.query(NongyneCytoHistoCorrelation.gyne_case_id)
            .filter(NongyneCytoHistoCorrelation.gyne_case_id.in_(case_ids))
            .distinct().all()
        )
        for c in items:
            c.has_correlation = c.id in corr_ids

    return {"items": items, "total": total}


def update_gyne_case(
    db: Session, db_obj: GyneCytologyCase, obj_in: GyneCytologyCaseUpdate
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

        # 🚩 แก้จาก db.refresh เป็นการ Query ใหม่พร้อมโหลด Relationship
        full_db_obj = (
            db.query(GyneCytologyCase)
            .options(
                selectinload(GyneCytologyCase.patient).selectinload(Patient.title),
                selectinload(GyneCytologyCase.hospital),
                selectinload(GyneCytologyCase.pathologist),
                selectinload(GyneCytologyCase.cytotechnologist),
            )
            .filter(GyneCytologyCase.id == db_obj.id)
            .first()
        )

        return full_db_obj
    except Exception as e:
        db.rollback()
        raise e


def delete_gyne_case(db: Session, case_id: int):
    db_obj = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()

    if not db_obj:
        return None

    # ป้องกันการลบหากเคสถูก Screen หรือ Report ไปแล้ว
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


def get_gyne_statistics(
    db: Session, start_date, end_date, pathologist_id: int = None, cytotechnologist_id: int = None
):
    from collections import defaultdict

    query = db.query(GyneCytologyCase).filter(
        func.date(GyneCytologyCase.registered_at) >= start_date,
        func.date(GyneCytologyCase.registered_at) <= end_date,
    )
    if pathologist_id:
        query = query.filter(GyneCytologyCase.pathologist_id == pathologist_id)
    if cytotechnologist_id:
        query = query.filter(GyneCytologyCase.cytotechnologist_id == cytotechnologist_id)

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


def get_gyne_qc_case_list(db: Session, start_date, end_date, review_reason: str = None, pathologist_id: int = None, cytotechnologist_id: int = None):
    query = (
        db.query(GyneCytologyCase)
        .options(
            joinedload(GyneCytologyCase.patient),
            joinedload(GyneCytologyCase.reviewed_by),
        )
        .filter(
            GyneCytologyCase.review_reason.isnot(None),
            GyneCytologyCase.reviewed_at.isnot(None),
            func.date(GyneCytologyCase.reviewed_at) >= start_date,
            func.date(GyneCytologyCase.reviewed_at) <= end_date,
        )
    )
    if review_reason:
        query = query.filter(GyneCytologyCase.review_reason == review_reason)
    if pathologist_id:
        query = query.filter(GyneCytologyCase.pathologist_id == pathologist_id)
    if cytotechnologist_id:
        query = query.filter(GyneCytologyCase.cytotechnologist_id == cytotechnologist_id)
    cases = query.order_by(GyneCytologyCase.reviewed_at.desc()).all()

    return [
        {
            "id": c.id,
            "accession_no": c.accession_no,
            "hn": c.hn,
            "patient_name": c.patient.name if c.patient else None,
            "review_reason": c.review_reason,
            "review_result": c.review_result,
            "discrepancy_level": c.discrepancy_level,
            "review_note": c.review_note,
            "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
            "reviewed_by": c.reviewed_by.full_name if c.reviewed_by else None,
        }
        for c in cases
    ]


def get_gyne_qc_statistics(db: Session, start_date, end_date, pathologist_id: int = None, cytotechnologist_id: int = None):
    query = db.query(GyneCytologyCase).filter(
        GyneCytologyCase.review_reason.isnot(None),
        GyneCytologyCase.reviewed_at.isnot(None),
        func.date(GyneCytologyCase.reviewed_at) >= start_date,
        func.date(GyneCytologyCase.reviewed_at) <= end_date,
    )
    if pathologist_id:
        query = query.filter(GyneCytologyCase.pathologist_id == pathologist_id)
    if cytotechnologist_id:
        query = query.filter(GyneCytologyCase.cytotechnologist_id == cytotechnologist_id)
    cases = query.all()

    def _bucket(subset):
        total = len(subset)
        agree = sum(1 for c in subset if c.review_result == "agree")
        disagree = sum(1 for c in subset if c.review_result == "disagree")
        minor = sum(1 for c in subset if c.discrepancy_level == "minor")
        major = sum(1 for c in subset if c.discrepancy_level == "major")
        return {
            "total": total,
            "agree": agree,
            "disagree": disagree,
            "agree_rate": round(agree / total * 100, 1) if total else 0,
            "disagree_rate": round(disagree / total * 100, 1) if total else 0,
            "minor_discrepancy": minor,
            "major_discrepancy": major,
        }

    nilm = [c for c in cases if c.review_reason == "random_10pct"]
    abnormal = [c for c in cases if c.review_reason == "abnormal"]

    return {
        "nilm": _bucket(nilm),
        "abnormal": _bucket(abnormal),
        "total_reviewed": len(cases),
    }


_LSIL_CODES = {"306", "307", "308"}
_HSIL_OR_ABOVE_CODES = {
    "305",
    "309", "310", "311", "312", "313",
    "314",
    "315", "316", "317", "318", "319",
    "320", "321", "322", "323", "324",
    "325", "326", "327", "328",
}


def get_gyne_summary_table(
    db: Session, start_date, end_date,
    pathologist_id: int = None, cytotechnologist_id: int = None,
):
    """Monthly summary: conventional, liquid, unsatisfactory, LSIL, HSIL+ major/minor discordant, total."""
    from app.models.gyne_diagnosis import GyneDiagnosis, GyneDiagnosisCategory
    from sqlalchemy import and_
    from collections import defaultdict

    q = (
        db.query(GyneCytologyCase, GyneDiagnosis, GyneDiagnosisCategory)
        .outerjoin(
            GyneDiagnosis,
            and_(GyneDiagnosis.case_id == GyneCytologyCase.id, GyneDiagnosis.is_current.is_(True)),
        )
        .outerjoin(GyneDiagnosisCategory, GyneDiagnosisCategory.id == GyneDiagnosis.category_2_id)
        .filter(
            func.date(GyneCytologyCase.registered_at) >= start_date,
            func.date(GyneCytologyCase.registered_at) <= end_date,
        )
    )
    if pathologist_id:
        q = q.filter(GyneCytologyCase.pathologist_id == pathologist_id)
    if cytotechnologist_id:
        q = q.filter(GyneCytologyCase.cytotechnologist_id == cytotechnologist_id)

    def _zero():
        return {
            "conventional": 0, "liquid_based": 0,
            "unsatisfactory": 0, "lsil": 0,
            "hsil_major_discordant": 0, "hsil_minor_discordant": 0,
            "total": 0,
        }

    months: dict[str, dict] = defaultdict(_zero)

    for case, _diag, cat in q.all():
        if not case.registered_at:
            continue
        month_key = case.registered_at.strftime("%Y-%m")
        row = months[month_key]

        specimen = (case.specimen_type or "").lower()
        code = cat.code if cat else None

        is_conv = "conventional" in specimen
        is_liq = "liquid" in specimen or "lbc" in specimen
        is_unsat = case.is_satisfied_specimen is False
        is_lsil = code in _LSIL_CODES
        is_hsil_plus = code in _HSIL_OR_ABOVE_CODES

        if is_conv:
            row["conventional"] += 1
            row["total"] += 1
        elif is_liq:
            row["liquid_based"] += 1
            row["total"] += 1
        else:
            # still count in total for cases without clear specimen type
            row["total"] += 1

        if is_unsat:
            row["unsatisfactory"] += 1
        if is_lsil:
            row["lsil"] += 1
        if is_hsil_plus:
            if case.discrepancy_level == "major":
                row["hsil_major_discordant"] += 1
            elif case.discrepancy_level == "minor":
                row["hsil_minor_discordant"] += 1

    return [
        {"period": k, **v}
        for k, v in sorted(months.items())
    ]


def get_gyne_slide_quality_stats(db: Session, start_date, end_date):
    def _count_quality(field):
        rows = (
            db.query(field, func.count(GyneCytologyCase.id))
            .filter(
                func.date(GyneCytologyCase.registered_at) >= start_date,
                func.date(GyneCytologyCase.registered_at) <= end_date,
            )
            .group_by(field)
            .all()
        )
        result = {"good": 0, "fair": 0, "poor": 0, "unspecified": 0}
        for val, cnt in rows:
            key = val if val in result else "unspecified"
            result[key] += cnt
        return result

    slide = _count_quality(GyneCytologyCase.slide_quality)
    stain = _count_quality(GyneCytologyCase.stain_quality)
    total = sum(slide.values())
    return {"total": total, "slide_quality": slide, "stain_quality": stain}
