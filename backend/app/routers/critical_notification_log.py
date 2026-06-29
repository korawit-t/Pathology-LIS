from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from fastapi import HTTPException
from app.schemas.critical_notification_log import (
    CriticalNotificationLogCreate,
    CriticalNotificationLogUpdate,
    CriticalNotificationLogResponse,
    CriticalNotificationLogList,
)
from app.crud import critical_notification_log as crud
from app.models.user import User
from app.models.notification_channel import NotificationChannel
from app.models.surgical_case import SurgicalCase
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.patient import Patient
from app.dependencies.auth import get_current_user
from app.services.notification_service import broadcast_to_channels, to_bangkok_str
from app.crud import notification_rule as crud_rule


def _lookup_case_data(db: Session, case_id: int, case_type: str) -> dict:
    """Return hn, name, clinician, id_case for any case type."""
    model_map = {
        "SURGICAL": SurgicalCase,
        "GYNE_CYTO": GyneCytologyCase,
        "NONGYNE_CYTO": NongyneCytologyCase,
    }
    model = model_map.get(case_type.upper())
    if not model:
        return {}
    case = db.query(model).filter(model.id == case_id).first()
    if not case:
        return {}
    patient = db.query(Patient).filter(Patient.id == case.patient_id).first()
    name = ""
    if patient:
        name = patient.name or ""
        if patient.ln:
            name = f"{name} {patient.ln}".strip()
    return {
        "hn": case.hn or "-",
        "name": name or "-",
        "clinician": case.clinician_name or "-",
        "id_case": case.accession_no or str(case_id),
    }

router = APIRouter(prefix="/critical-notification-logs", tags=["Critical Notification Log"])

_TYPE_TO_EVENT = {
    "malignancy": "malignancy_result",
    "critical_value": "critical_case",
}

_TYPE_LABEL = {
    "malignancy": "ผลออก Malignancy",
    "critical_value": "เคสวิกฤต (Critical)",
    "other": "อื่นๆ",
}

_DEFAULT_BROADCAST_TEMPLATE = (
    "🚨 {type_label}\n"
    "Case: {case_type} #{case_id}\n"
    "แจ้งผลให้: {recipient_name}\n"
    "วัน/เวลา: {notified_at}\n"
    "หมายเหตุ: {note}"
)


@router.get("", response_model=CriticalNotificationLogList)
def list_all(
    case_type: Optional[str] = None,
    notification_type: Optional[str] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return crud.get_all(db, skip=skip, limit=limit, case_type=case_type, notification_type=notification_type)


@router.get("/case/{case_id}/{case_type}", response_model=CriticalNotificationLogList)
def list_by_case(
    case_id: int,
    case_type: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return crud.get_by_case(db, case_id=case_id, case_type=case_type)


@router.post("", response_model=CriticalNotificationLogResponse, status_code=201)
async def create(
    obj_in: CriticalNotificationLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channel_names = []
    if obj_in.channel_ids:
        channels = (
            db.query(NotificationChannel)
            .filter(NotificationChannel.id.in_(obj_in.channel_ids), NotificationChannel.is_active == True)
            .all()
        )
        if channels:
            channel_names = [f"{ch.name} ({ch.platform.upper()})" for ch in channels]
            event_key = _TYPE_TO_EVENT.get(obj_in.notification_type)
            rule = crud_rule.get_rule_by_event(db, event_key) if event_key else None
            template = rule.message_template if (rule and rule.message_template) else _DEFAULT_BROADCAST_TEMPLATE
            case_data = _lookup_case_data(db, obj_in.case_id, obj_in.case_type)
            data = {
                "type_label": _TYPE_LABEL.get(obj_in.notification_type, obj_in.notification_type),
                "case_type": obj_in.case_type,
                "case_id": str(obj_in.case_id),
                "accession_no": obj_in.accession_no or case_data.get("id_case") or "-",
                "recipient_name": obj_in.recipient_name or "-",
                "notified_at": to_bangkok_str(obj_in.notified_at),
                "note": obj_in.note or "-",
                **case_data,
            }
            await broadcast_to_channels(channels=channels, template=template, data=data)

    record = crud.create(
        db,
        obj_in=obj_in,
        notified_by_id=current_user.id,
        notified_channel_names=channel_names or None,
    )
    return record


@router.patch("/{record_id}", response_model=CriticalNotificationLogResponse)
def update_recipient(
    record_id: int,
    obj_in: CriticalNotificationLogUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    record = crud.update_recipient(db, record_id=record_id, obj_in=obj_in)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record
