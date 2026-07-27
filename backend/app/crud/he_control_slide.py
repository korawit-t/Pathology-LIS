from datetime import date
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.he_control_slide import HEControlSlide
from app.utils.time import local_now


def _get_next_control_no(db: Session, control_date: date) -> str:
    prefix = f"HECTRL-{control_date.strftime('%y%m%d')}"

    # Low-throughput, once-a-day manual action — with_for_update() serializes
    # against any rows already inserted today, same trade-off as the accession
    # number generators (see _get_next_accession_no in crud/surgical_case.py).
    existing = (
        db.query(HEControlSlide.id)
        .filter(HEControlSlide.control_date == control_date)
        .with_for_update()
        .all()
    )
    n = len(existing)
    return prefix if n == 0 else f"{prefix}-{n + 1}"


def create_control_slide(db: Session, performed_by_id: int) -> HEControlSlide:
    today = local_now().date()
    control_no = _get_next_control_no(db, today)

    obj = HEControlSlide(
        control_no=control_no,
        control_date=today,
        performed_by_id=performed_by_id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_control_slide(db: Session, slide_id: int) -> Optional[HEControlSlide]:
    return (
        db.query(HEControlSlide)
        .options(joinedload(HEControlSlide.performed_by))
        .filter(HEControlSlide.id == slide_id)
        .first()
    )


def get_control_slides(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> List[HEControlSlide]:
    query = db.query(HEControlSlide).options(joinedload(HEControlSlide.performed_by))
    if date_from:
        query = query.filter(HEControlSlide.control_date >= date_from)
    if date_to:
        query = query.filter(HEControlSlide.control_date <= date_to)
    return (
        query.order_by(HEControlSlide.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
