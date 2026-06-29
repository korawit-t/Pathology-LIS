from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime


class UserBrief(BaseModel):
    id: int
    full_name: Optional[str] = None
    username: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    user: Optional[UserBrief] = None
    action: str
    resource_type: str
    resource_id: Optional[int] = None
    old_values: Optional[Any] = None
    new_values: Optional[Any] = None
    ip_address: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AuditLogListResponse(BaseModel):
    total: int
    items: list[AuditLogResponse]
