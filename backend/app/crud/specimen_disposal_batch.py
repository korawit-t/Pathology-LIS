from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.crud.slide_block_release import _full_patient_name
from app.models.patient import Patient
from app.models.specimen_disposal_batch import (
    SpecimenDisposalBatch,
    SpecimenDisposalBatchItem,
)
from app.models.surgical_case import SurgicalCase
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.utils.time import local_now

OPEN_STATUS = "PRINTED"


def open_batch_case_ids_subquery():
    """case_id ทุกตัวที่ยังค้างอยู่ในใบที่พิมพ์แล้วแต่ยังไม่ได้ยืนยันทำลาย

    ใช้กันไม่ให้เคสเดียวไปโผล่สองใบพร้อมกัน ซึ่งจะทำให้คนถือกระดาษสองใบ
    เดินไปหาของชิ้นเดียวกัน
    """
    return (
        select(SpecimenDisposalBatchItem.case_id)
        .join(SpecimenDisposalBatch)
        .where(SpecimenDisposalBatch.status == OPEN_STATUS)
    )


def generate_batch_no(db: Session) -> str:
    year = local_now().strftime("%Y")
    prefix = f"DSP-{year}-"
    # with_for_update() กันเลขซ้ำเวลาสองคนกดสร้างใบพร้อมกัน — pattern เดียวกับ
    # การออก accession no.
    last = (
        db.query(SpecimenDisposalBatch.batch_no)
        .filter(SpecimenDisposalBatch.batch_no.like(f"{prefix}%"))
        .order_by(SpecimenDisposalBatch.batch_no.desc())
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


def _signer_name(db: Session, user_id: int, label: str) -> tuple[User, str]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail=f"ไม่พบผู้ใช้สำหรับ{label} (id={user_id})")
    return user, (user.full_name or user.username)


def create_batch(
    db: Session,
    *,
    case_ids: list[int],
    disposer_id: int,
    verifier_id: int,
    approver_id: int,
    retention_days: Optional[int],
    printed_by_id: int,
) -> SpecimenDisposalBatch:
    if disposer_id == verifier_id:
        raise HTTPException(
            status_code=400,
            detail="ผู้ตรวจสอบต้องเป็นคนละคนกับผู้ทิ้ง",
        )

    unique_ids = list(dict.fromkeys(case_ids))
    cases = db.query(SurgicalCase).filter(SurgicalCase.id.in_(unique_ids)).all()

    found = {c.id for c in cases}
    missing = [i for i in unique_ids if i not in found]
    if missing:
        raise HTTPException(status_code=400, detail=f"ไม่พบเคส id: {missing}")

    already_discarded = [c.accession_no for c in cases if c.discard_status]
    if already_discarded:
        raise HTTPException(
            status_code=400,
            detail=f"เคสถูกทำลายไปแล้ว: {', '.join(already_discarded)}",
        )

    not_stored = [c.accession_no for c in cases if not c.specimen_storage_status]
    if not_stored:
        raise HTTPException(
            status_code=400,
            detail=f"เคสยังไม่ได้จัดเก็บ จึงยังทำลายไม่ได้: {', '.join(not_stored)}",
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

    batch = SpecimenDisposalBatch(
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
        batch.items.append(
            SpecimenDisposalBatchItem(
                case_id=case.id,
                container_snapshot=case.specimen_storage_container,
            )
        )

    db.add(batch)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(batch)
    return batch


def _batch_query(db: Session):
    return db.query(SpecimenDisposalBatch).options(
        joinedload(SpecimenDisposalBatch.printed_by),
        joinedload(SpecimenDisposalBatch.disposed_by),
        joinedload(SpecimenDisposalBatch.cancelled_by),
        selectinload(SpecimenDisposalBatch.items)
        .joinedload(SpecimenDisposalBatchItem.case)
        .joinedload(SurgicalCase.patient)
        .joinedload(Patient.title),
    )


def get_batches(
    db: Session, skip: int = 0, limit: int = 20, status: Optional[str] = None
) -> dict:
    query = _batch_query(db)
    if status:
        query = query.filter(SpecimenDisposalBatch.status == status)
    total = query.order_by(None).count()
    items = (
        query.order_by(SpecimenDisposalBatch.id.desc()).offset(skip).limit(limit).all()
    )
    return {"items": items, "total": total}


def get_batch(db: Session, batch_id: int) -> SpecimenDisposalBatch:
    batch = _batch_query(db).filter(SpecimenDisposalBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="ไม่พบใบตรวจสอบการทำลาย")
    return batch


def count_open_batches(db: Session) -> int:
    return (
        db.query(SpecimenDisposalBatch)
        .filter(SpecimenDisposalBatch.status == OPEN_STATUS)
        .count()
    )


def build_disposal_checklist_data(db: Session, batch_id: int) -> dict:
    """สร้าง dict ให้ template ใบตรวจสอบ — จัดกลุ่มตามกล่องเพราะคนเช็คหน้างานเดินทีละกล่อง"""
    batch = get_batch(db, batch_id)

    settings = db.query(SystemSetting).first()
    lab_name_th = settings.lab_name_th if settings else "ห้องปฏิบัติการพยาธิวิทยา"
    lab_address = (settings.lab_address if settings else "") or ""

    today = local_now().date()
    groups: dict[str, list[dict]] = {}
    for item in batch.items:
        case = item.case
        if not case:
            continue
        report_at = case.report_at
        groups.setdefault(item.container_snapshot or "-", []).append(
            {
                "accession_no": case.accession_no or "-",
                "hn": case.hn or "-",
                "patient_name": _full_patient_name(case.patient),
                "report_date": report_at.strftime("%d/%m/%Y") if report_at else "-",
                "age_days": (today - report_at.date()).days if report_at else "-",
            }
        )

    grouped = [
        {"container": container, "count": len(rows), "rows": rows}
        for container, rows in sorted(groups.items())
    ]

    printed_by = batch.printed_by
    return {
        "lab_name_th": lab_name_th,
        "lab_address": lab_address,
        "batch_no": batch.batch_no,
        "retention_days": batch.retention_days,
        "printed_on": batch.printed_at.strftime("%d/%m/%Y %H:%M") if batch.printed_at else "",
        "printed_by_name": (printed_by.full_name or printed_by.username) if printed_by else "",
        "disposer_name": batch.disposer_name or "",
        "verifier_name": batch.verifier_name or "",
        "approver_name": batch.approver_name or "",
        "groups": grouped,
        "total_items": sum(g["count"] for g in grouped),
        "total_containers": len(grouped),
    }


def confirm_batch_disposal(
    db: Session,
    batch_id: int,
    *,
    confirmed_by_id: int,
    disposal_method: Optional[str] = None,
    remark: Optional[str] = None,
) -> SpecimenDisposalBatch:
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
        case.specimen_storage_status = "Discarded"
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
) -> SpecimenDisposalBatch:
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
