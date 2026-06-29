# app/schemas/notification_rule.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class NotificationRuleBase(BaseModel):
    event_key: str
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    message_template: Optional[str] = None
    is_active: bool = True


class NotificationRuleCreate(NotificationRuleBase):
    pass


class NotificationRuleUpdate(BaseModel):
    channel_id: Optional[int] = None
    channel_ids: Optional[List[int]] = None
    message_template: Optional[str] = None
    is_active: Optional[bool] = None


class NotificationRuleResponse(NotificationRuleBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
