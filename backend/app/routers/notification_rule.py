# app/routers/notification_rule.py
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.db.database import get_db
from app.schemas.notification_rule import NotificationRuleResponse, NotificationRuleUpdate
from app.crud import notification_rule as crud_rule
from app.models.notification_channel import NotificationChannel
from app.core.roles import CAN_MANAGE_SETTINGS
from app.services.notification_service import send_real_notification
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class TriggerEventBody(BaseModel):
    data: Dict[str, Any]  # { hn, name, clinician, id_case, ... }


router = APIRouter(
    prefix="/notification-rules",
    tags=["Notification Rules"],
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)


@router.get("", response_model=List[NotificationRuleResponse])
def read_rules(db: Session = Depends(get_db)):
    """Get all notification rules (auto-seeded with predefined events)."""
    return crud_rule.get_rules(db)


@router.put("/{event_key}", response_model=NotificationRuleResponse)
def update_rule(event_key: str, update: NotificationRuleUpdate, db: Session = Depends(get_db)):
    """Create or update a rule for the given event_key."""
    return crud_rule.upsert_rule(db, event_key=event_key, update=update)


@router.post("/trigger/{event_key}")
async def trigger_event(event_key: str, body: TriggerEventBody, db: Session = Depends(get_db)):
    """
    Trigger a notification for an event.
    Uses channel_ids (multi-channel) when set, falls back to channel_id.
    """
    rule = crud_rule.get_rule_by_event(db, event_key)
    if not rule:
        return {"success": False, "detail": "No rule configured for this event"}
    if not rule.is_active:
        return {"success": False, "detail": "Rule is disabled"}

    ids = rule.channel_ids or ([rule.channel_id] if rule.channel_id else [])
    if not ids:
        return {"success": False, "detail": "No channel assigned to this rule"}

    channels = (
        db.query(NotificationChannel)
        .filter(NotificationChannel.id.in_(ids), NotificationChannel.is_active == True)
        .all()
    )
    if not channels:
        return {"success": False, "detail": "No active channels found"}

    results = []
    for ch in channels:
        creds = {**ch.credentials}
        if rule.message_template:
            creds["message_template"] = rule.message_template
        try:
            result = await send_real_notification(platform=ch.platform, credentials=creds, data=body.data)
            results.append(result)
        except Exception:
            # Don't return str(e) to the client — e.g. the Slack send path
            # raises with the webhook URL embedded in the message, and that
            # URL *is* the channel's secret. Log full detail server-side only.
            logger.error("Notification send failed for channel %s (%s)", ch.name, ch.platform, exc_info=True)
            results.append({"error": "Failed to send notification", "channel": ch.name})

    return {"success": True, "detail": f"Sent to {len(results)} channel(s)", "results": results}

