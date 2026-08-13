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
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.patient import Patient
from app.dependencies.auth import get_current_user
from app.utils.patient_name import full_patient_name
from app.services.notification_service import (
    broadcast_to_channels,
    build_his_patient_context,
    to_bangkok_str,
)
from app.crud import notification_rule as crud_rule


def _lookup_specimen(db: Session, case, case_type: str) -> str:
    """One line saying what was actually examined, for the alert body.

    Surgical cases report specimen A only: 78% of malignant cases have a
    single specimen, and where there are more the extras are usually margins
    or segments ("Proximal end, excision") that add length without adding
    information — specimen A is the main one by grossing convention. The rest
    are reported as a count.

    Gyne cytology is deliberately excluded: its specimen_type is the
    preparation method (Conventional/LBC) rather than a site, and a pap is
    always cervical, so the line would carry nothing.
    """
    ct = case_type.upper()
    if ct == "SURGICAL":
        rows = (
            db.query(SurgicalSpecimen.specimen_name)
            .filter(SurgicalSpecimen.case_id == case.id)
            .order_by(SurgicalSpecimen.specimen_label)
            .all()
        )
        names = [r[0] for r in rows if r[0]]
        if not names:
            return ""
        return f"{names[0]} (+{len(names) - 1} ชิ้น)" if len(names) > 1 else names[0]
    if ct == "NONGYNE_CYTO":
        return case.specimen_type or ""
    return ""


def _lookup_case_data(db: Session, case_id: int, case_type: str) -> dict:
    """Return hn, name, clinician, id_case, specimen for any case type."""
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
    return {
        "hn": case.hn or "-",
        "name": full_patient_name(patient, default="-"),
        "clinician": case.clinician_name or "-",
        "id_case": case.accession_no or str(case_id),
        "specimen": _lookup_specimen(db, case, case_type),
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
    "ชิ้นเนื้อ: {specimen}\n"
    "แจ้งผลให้: {recipient_name}\n"
    "วัน/เวลา: {notified_at}\n"
    "หมายเหตุ: {note}"
    "{admission}"
    "{appointments}"
)

# Malignancy alerts additionally carry what was examined, whether the patient
# is currently an inpatient, and their upcoming HOSxP appointments — "cancer of
# what?", "are they in a ward right now?" and "are they booked to be seen
# again?" are what the recipient acts on, and none is answerable from HN and
# name alone.
_HIS_LOOKUP_TYPES = {"malignancy"}

# In reading order. Templates saved before a field existed don't name its
# placeholder; appending what's missing beats silently dropping the data, and
# each one is inserted ahead of the first later placeholder already present so
# the order holds whichever subset a stored template happens to carry.
_LATE_PLACEHOLDERS = (
    ("specimen", "{specimen}", "\nชิ้นเนื้อ: {specimen}"),
    ("admission", "{admission}", "{admission}"),
    ("appointments", "{appointments}", "{appointments}"),
)


def _augment_template(template: str, **present: bool) -> str:
    """Add the placeholders that admin-configured templates predate.

    An admin who wants a field somewhere else just writes the placeholder into
    the template by hand, and this leaves it exactly where they put it.
    """
    for i, (key, placeholder, snippet) in enumerate(_LATE_PLACEHOLDERS):
        if not present.get(key) or placeholder in template:
            continue
        at = -1
        for _, later, _snippet in _LATE_PLACEHOLDERS[i + 1:]:
            at = template.find(later)
            if at != -1:
                break
        template = template[:at] + snippet + template[at:] if at != -1 else template + snippet
    return template


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

            specimen = case_data.get("specimen") or ""
            admission = appointments = ""
            if obj_in.notification_type in _HIS_LOOKUP_TYPES:
                admission, appointments = build_his_patient_context(case_data.get("hn"))
            template = _augment_template(
                template,
                specimen=bool(specimen),
                admission=bool(admission),
                appointments=bool(appointments),
            )

            data = {
                "type_label": _TYPE_LABEL.get(obj_in.notification_type, obj_in.notification_type),
                "case_type": obj_in.case_type,
                "case_id": str(obj_in.case_id),
                "accession_no": obj_in.accession_no or case_data.get("id_case") or "-",
                "recipient_name": obj_in.recipient_name or "-",
                "notified_at": to_bangkok_str(obj_in.notified_at),
                "note": obj_in.note or "-",
                "admission": admission,
                "appointments": appointments,
                **case_data,
                # after **case_data: a gyne case has no specimen line, but a
                # template that names the placeholder anyway must not render a
                # dangling "ชิ้นเนื้อ:" with nothing after it
                "specimen": specimen or "-",
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
