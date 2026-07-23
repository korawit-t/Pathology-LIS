# app/routers/scheduled_notification_rule.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.schemas.scheduled_notification_rule import (
    ScheduledNotificationRuleResponse,
    ScheduledNotificationRuleUpdate,
)
from app.crud import scheduled_notification_rule as crud_rule
from app.core.roles import CAN_MANAGE_SETTINGS

router = APIRouter(
    prefix="/scheduled-notification-rules",
    tags=["Scheduled Notification Rules"],
    dependencies=[Depends(CAN_MANAGE_SETTINGS)],
)


@router.get("", response_model=List[ScheduledNotificationRuleResponse])
def read_rules(db: Session = Depends(get_db)):
    """Get all scheduled notification rules (auto-seeded with predefined check types)."""
    return crud_rule.get_rules(db)


@router.put("/{rule_type}", response_model=ScheduledNotificationRuleResponse)
def update_rule(rule_type: str, update: ScheduledNotificationRuleUpdate, db: Session = Depends(get_db)):
    """Create or update a scheduled rule for the given rule_type."""
    return crud_rule.upsert_rule(db, rule_type=rule_type, update=update)
