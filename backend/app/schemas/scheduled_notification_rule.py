# app/schemas/scheduled_notification_rule.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class ScheduledNotificationRuleBase(BaseModel):
    rule_type: str
    label: Optional[str] = None
    threshold_value: int = 2
    threshold_unit: str = "hours"
    channel_ids: Optional[List[int]] = None
    message_template: Optional[str] = None
    is_active: bool = False


class ScheduledNotificationRuleUpdate(BaseModel):
    label: Optional[str] = None
    threshold_value: Optional[int] = None
    threshold_unit: Optional[str] = None
    channel_ids: Optional[List[int]] = None
    message_template: Optional[str] = None
    is_active: Optional[bool] = None


class ScheduledNotificationRuleResponse(ScheduledNotificationRuleBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
