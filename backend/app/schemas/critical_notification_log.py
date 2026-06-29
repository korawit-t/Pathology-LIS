from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import Optional, List, Literal


class UserBrief(BaseModel):
    id: int
    full_name: Optional[str] = None
    username: str

    model_config = ConfigDict(from_attributes=True)


class CriticalNotificationLogCreate(BaseModel):
    case_id: int
    case_type: Literal["SURGICAL", "GYNE_CYTO", "NONGYNE_CYTO"]
    notification_type: str  # critical_value | malignancy | other
    notified_at: datetime
    accession_no: Optional[str] = None
    recipient_name: Optional[str] = None
    recipient_role: Optional[str] = None
    note: Optional[str] = None
    channel_ids: Optional[List[int]] = None  # channels to notify; None or [] = no broadcast


class CriticalNotificationLogResponse(BaseModel):
    id: int
    case_id: int
    case_type: str
    accession_no: Optional[str] = None
    notification_type: str
    notified_at: datetime
    recipient_name: Optional[str] = None
    recipient_role: Optional[str] = None
    note: Optional[str] = None
    notified_channel_names: Optional[List[str]] = None
    notified_by_id: Optional[int] = None
    notified_by: Optional[UserBrief] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CriticalNotificationLogUpdate(BaseModel):
    recipient_name: Optional[str] = None
    recipient_role: Optional[str] = None


class CriticalNotificationLogList(BaseModel):
    total: int
    items: List[CriticalNotificationLogResponse]
