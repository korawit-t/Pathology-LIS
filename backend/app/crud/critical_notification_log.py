from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.models.critical_notification_log import CriticalNotificationLog
from app.schemas.critical_notification_log import CriticalNotificationLogCreate, CriticalNotificationLogUpdate


def create(
    db: Session,
    obj_in: CriticalNotificationLogCreate,
    notified_by_id: Optional[int] = None,
    notified_channel_names: Optional[list] = None,
) -> CriticalNotificationLog:
    record = CriticalNotificationLog(
        case_id=obj_in.case_id,
        case_type=obj_in.case_type,
        accession_no=obj_in.accession_no,
        notification_type=obj_in.notification_type,
        notified_at=obj_in.notified_at,
        recipient_name=obj_in.recipient_name,
        recipient_role=obj_in.recipient_role,
        note=obj_in.note,
        notified_by_id=notified_by_id,
        notified_channel_names=notified_channel_names,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def update_recipient(
    db: Session,
    record_id: int,
    obj_in: CriticalNotificationLogUpdate,
) -> Optional[CriticalNotificationLog]:
    record = db.query(CriticalNotificationLog).filter(CriticalNotificationLog.id == record_id).first()
    if not record:
        return None
    if obj_in.recipient_name is not None:
        record.recipient_name = obj_in.recipient_name
    if obj_in.recipient_role is not None:
        record.recipient_role = obj_in.recipient_role
    db.commit()
    db.refresh(record)
    return record


def get_by_case(
    db: Session,
    case_id: int,
    case_type: str,
) -> dict:
    query = (
        db.query(CriticalNotificationLog)
        .filter(
            CriticalNotificationLog.case_id == case_id,
            CriticalNotificationLog.case_type == case_type,
        )
        .options(joinedload(CriticalNotificationLog.notified_by))
        .order_by(CriticalNotificationLog.notified_at.desc())
    )
    items = query.all()
    return {"total": len(items), "items": items}


def get_all(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    case_type: Optional[str] = None,
    notification_type: Optional[str] = None,
) -> dict:
    query = db.query(CriticalNotificationLog).options(
        joinedload(CriticalNotificationLog.notified_by)
    )
    if case_type:
        query = query.filter(CriticalNotificationLog.case_type == case_type)
    if notification_type:
        query = query.filter(CriticalNotificationLog.notification_type == notification_type)

    total = query.count()
    items = (
        query.order_by(CriticalNotificationLog.notified_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"total": total, "items": items}
