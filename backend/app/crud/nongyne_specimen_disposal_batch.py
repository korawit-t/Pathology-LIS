from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.crud.slide_block_release import _full_patient_name

# กติกาว่าใครลงนามได้เหมือนกันเป๊ะกับใบของ surgical (กัน clinician/hospital)
# จึงใช้ตัวเดียวกัน ไม่ copy มาให้แก้หลุดกันทีหลัง
from app.crud.specimen_disposal_batch import _signer_name
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_specimen_disposal_batch import (
    NongyneSpecimenDisposalBatch,
    NongyneSpecimenDisposalBatchItem,
)
from app.models.patient import Patient
from app.models.system_setting import SystemSetting
from app.utils.time import local_now

OPEN_STATUS = "PRINTED"
DEFAULT_RETENTION_DAYS = 30


def get_retention_days(db: Session) -> int:
    settings = db.query(SystemSetting).first()
    value = settings.nongyne_specimen_retention_days if settings else None
    return DEFAULT_RETENTION_DAYS if value is None else int(value)


def open_batch_case_ids_subquery():
    """case_id ทุกตัวที่ยังค้างอยู่ในใบที่พิมพ์แล้วแต่ยังไม่ได้ยืนยันทำลาย

    กันไม่ให้เคสเดียวไปโผล่สองใบพร้อมกัน
    """
    return (
        select(NongyneSpecimenDisposalBatchItem.case_id)
        .join(NongyneSpecimenDisposalBatch)
        .where(NongyneSpecimenDisposalBatch.status == OPEN_STATUS)
    )


def generate_batch_no(db: Session) -> str:
    year = local_now().strftime("%Y")
    # NDSP- แยกลำดับจาก DSP- ของ surgical — สองงานนี้เดินคนละรอบกัน
    prefix = f"NDSP-{year}-"
    last = (
        db.query(NongyneSpecimenDisposalBatch.batch_no)
        .filter(NongyneSpecimenDisposalBatch.batch_no.like(f"{prefix}%"))
        .order_by(NongyneSpecimenDisposalBatch.batch_no.desc())
        .with_for_update()
        .first()
    )
    if last:
        try:
            seq = int(last[0].split("-")[-1]) + 1
        except (IndexError, ValueError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def _age_days(case: NongyneCytologyCase, today) -> Optional[int]:
    return (today - case.report_at.date()).days if case.report_at else None


def create_batch(
    db: Session,
    *,
    case_ids: list[int],
    disposer_id: int,
    verifier_id: int,
    approver_id: int,
    printed_by_id: int,
) -> NongyneSpecimenDisposalBatch:
    """สร้างใบตรวจสอบก่อนทำลาย

    เงื่อนไข "ออกผลแล้วกี่วัน / ไม่ค้าง pending" บังคับที่นี่ ไม่ใช่แค่ซ่อนปุ่มฝั่ง
    frontend — ยิง POST ตรงเข้ามาก็ต้องโดนปฏิเสธเหมือนกัน
    """
    if disposer_id == verifier_id:
        raise HTTPException(
            status_code=400,
            detail="ผู้ตรวจสอบต้องเป็นคนละคนกับผู้ทิ้ง",
        )

    retention_days = get_retention_days(db)
    today = local_now().date()

    unique_ids = list(dict.fromkeys(case_ids))
    cases = (
        db.query(NongyneCytologyCase)
        .filter(NongyneCytologyCase.id.in_(unique_ids))
        .all()
    )

    found = {c.id for c in cases}
    missing = [i for i in unique_ids if i not in found]
    if missing:
        raise HTTPException(status_code=400, detail=f"ไม่พบเคส id: {missing}")

    cancelled = [c.accession_no for c in cases if c.is_cancelled]
    if cancelled:
        raise HTTPException(
            status_code=400,
            detail=f"เคสถูกยกเลิกแล้ว: {', '.join(cancelled)}",
        )

    already_discarded = [c.accession_no for c in cases if c.discard_status]
    if already_discarded:
        raise HTTPException(
            status_code=400,
            detail=f"สิ่งส่งตรวจถูกทำลายไปแล้ว: {', '.join(already_discarded)}",
        )

    not_reported = [
        c.accession_no
        for c in cases
        if c.status != "published" or c.report_at is None
    ]
    if not_reported:
        raise HTTPException(
            status_code=400,
            detail=f"เคสยังไม่ได้รายงานผล จึงยังทำลายไม่ได้: {', '.join(not_reported)}",
        )

    pending = [c.accession_no for c in cases if c.is_pending]
    if pending:
        raise HTTPException(
            status_code=400,
            detail=f"เคสยังค้าง Pending อยู่ จึงยังทำลายไม่ได้: {', '.join(pending)}",
        )

    too_young = [
        f"{c.accession_no} ({_age_days(c, today)} วัน)"
        for c in cases
        if (_age_days(c, today) or 0) < retention_days
    ]
    if too_young:
        raise HTTPException(
            status_code=400,
            detail=(
                f"ยังไม่ครบ {retention_days} วันหลังรายงานผล: {', '.join(too_young)}"
            ),
        )

    open_ids = set(db.scalars(open_batch_case_ids_subquery()).all())
    duplicated = [c.accession_no for c in cases if c.id in open_ids]
    if duplicated:
        raise HTTPException(
            status_code=400,
            detail=f"เคสอยู่ในใบตรวจสอบที่ยังไม่ปิดอยู่แล้ว: {', '.join(duplicated)}",
        )

    _, disposer_name = _signer_name(db, disposer_id, "ผู้ทิ้ง")
    _, verifier_name = _signer_name(db, verifier_id, "ผู้ตรวจสอบ")
    _, approver_name = _signer_name(db, approver_id, "ผู้อนุมัติ")

    batch = NongyneSpecimenDisposalBatch(
        batch_no=generate_batch_no(db),
        retention_days=retention_days,
        status=OPEN_STATUS,
        printed_by_id=printed_by_id,
        printed_at=local_now(),
        disposer_id=disposer_id,
        verifier_id=verifier_id,
        approver_id=approver_id,
        disposer_name=disposer_name,
        verifier_name=verifier_name,
        approver_name=approver_name,
    )
    for case in cases:
        batch.items.append(NongyneSpecimenDisposalBatchItem(case_id=case.id))

    db.add(batch)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(batch)
    return batch


def _batch_query(db: Session):
    return db.query(NongyneSpecimenDisposalBatch).options(
        joinedload(NongyneSpecimenDisposalBatch.printed_by),
        joinedload(NongyneSpecimenDisposalBatch.disposed_by),
        joinedload(NongyneSpecimenDisposalBatch.cancelled_by),
        selectinload(NongyneSpecimenDisposalBatch.items)
        .joinedload(NongyneSpecimenDisposalBatchItem.case)
        .joinedload(NongyneCytologyCase.patient)
        .joinedload(Patient.title),
    )


def get_batches(
    db: Session, skip: int = 0, limit: int = 20, status: Optional[str] = None
) -> dict:
    query = _batch_query(db)
    if status:
        query = query.filter(NongyneSpecimenDisposalBatch.status == status)
    total = query.order_by(None).count()
    items = (
        query.order_by(NongyneSpecimenDisposalBatch.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"items": items, "total": total}


def get_batch(db: Session, batch_id: int) -> NongyneSpecimenDisposalBatch:
    batch = (
        _batch_query(db)
        .filter(NongyneSpecimenDisposalBatch.id == batch_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="ไม่พบใบตรวจสอบการทำลาย")
    return batch


def count_open_batches(db: Session) -> int:
    return (
        db.query(NongyneSpecimenDisposalBatch)
        .filter(NongyneSpecimenDisposalBatch.status == OPEN_STATUS)
        .count()
    )


def build_disposal_checklist_data(db: Session, batch_id: int) -> dict:
    """dict ให้ template ใบตรวจสอบ

    จัดกลุ่มตามชนิดสิ่งส่งตรวจ (surgical จัดตามกล่อง) เพราะ non-gyne ไม่มีกล่อง —
    คนเดินเก็บของในตู้เย็นไล่ทีละชนิดแทน
    """
    batch = get_batch(db, batch_id)

    settings = db.query(SystemSetting).first()
    lab_name_th = settings.lab_name_th if settings else "ห้องปฏิบัติการพยาธิวิทยา"
    lab_address = (settings.lab_address if settings else "") or ""
    doc_no = (settings.nongyne_specimen_disposal_doc_no if settings else "") or ""

    today = local_now().date()
    groups: dict[str, list[dict]] = {}
    for item in batch.items:
        case = item.case
        if not case:
            continue
        report_at = case.report_at
        groups.setdefault(case.specimen_type or "-", []).append(
            {
                "accession_no": case.accession_no or "-",
                "hn": case.hn or "-",
                "patient_name": _full_patient_name(case.patient),
                "collection_site": case.collection_site or "-",
                "report_date": report_at.strftime("%d/%m/%Y") if report_at else "-",
                "age_days": (today - report_at.date()).days if report_at else "-",
            }
        )

    grouped = [
        {"specimen_type": specimen_type, "count": len(rows), "rows": rows}
        for specimen_type, rows in sorted(groups.items())
    ]

    printed_by = batch.printed_by
    return {
        "lab_name_th": lab_name_th,
        "lab_address": lab_address,
        "doc_no": doc_no,
        "batch_no": batch.batch_no,
        "retention_days": batch.retention_days,
        "printed_on": (
            batch.printed_at.strftime("%d/%m/%Y %H:%M") if batch.printed_at else ""
        ),
        "printed_by_name": (
            (printed_by.full_name or printed_by.username) if printed_by else ""
        ),
        "disposer_name": batch.disposer_name or "",
        "verifier_name": batch.verifier_name or "",
        "approver_name": batch.approver_name or "",
        "groups": grouped,
        "total_items": sum(g["count"] for g in grouped),
        "total_groups": len(grouped),
    }


def confirm_batch_disposal(
    db: Session,
    batch_id: int,
    *,
    confirmed_by_id: int,
    disposal_method: Optional[str] = None,
    remark: Optional[str] = None,
) -> NongyneSpecimenDisposalBatch:
    batch = get_batch(db, batch_id)
    if batch.status != OPEN_STATUS:
        raise HTTPException(
            status_code=409,
            detail=f"ใบนี้อยู่ในสถานะ {batch.status} แล้ว ยืนยันซ้ำไม่ได้",
        )

    now = local_now()
    for item in batch.items:
        case = item.case
        if not case:
            continue
        case.discard_status = True
        case.discard_at = now
        # ผู้ทิ้งคือคนที่ลงมือทิ้งและเซ็นบนกระดาษ ไม่ใช่คนที่นั่งกดยืนยันในระบบ
        case.discard_by_id = batch.disposer_id

    batch.status = "DISPOSED"
    batch.disposed_at = now
    batch.disposed_by_id = confirmed_by_id
    if disposal_method:
        batch.disposal_method = disposal_method
    if remark:
        batch.remark = remark

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(batch)
    return batch


def cancel_batch(
    db: Session, batch_id: int, *, user_id: int, reason: Optional[str] = None
) -> NongyneSpecimenDisposalBatch:
    batch = get_batch(db, batch_id)
    if batch.status != OPEN_STATUS:
        raise HTTPException(
            status_code=409,
            detail=f"ยกเลิกได้เฉพาะใบที่ยังไม่ปิด (สถานะปัจจุบัน {batch.status})",
        )

    batch.status = "CANCELLED"
    batch.cancelled_at = local_now()
    batch.cancelled_by_id = user_id
    batch.cancel_reason = reason

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(batch)
    return batch
