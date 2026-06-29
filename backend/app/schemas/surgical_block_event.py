from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class UserNested(BaseModel):
    id: int
    full_name: Optional[str] = None
    username: str

    model_config = {"from_attributes": True}


class BlockEventCreate(BaseModel):
    event_type: str = Field(..., pattern="^(SENT_TO_OUTLAB|RETURNED_FROM_OUTLAB|NOTE)$")
    location: Optional[str] = None
    note: Optional[str] = None
    event_at: Optional[datetime] = None


class BlockEventResponse(BaseModel):
    id: int
    block_id: int
    event_type: str
    location: Optional[str] = None
    note: Optional[str] = None
    performed_by: UserNested
    event_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class BlockTimelineEntry(BaseModel):
    event_type: str
    source: str           # "auto" | "manual"
    label: str
    location: Optional[str] = None
    note: Optional[str] = None
    performed_by_name: Optional[str] = None
    event_at: datetime
    event_id: Optional[int] = None   # only for manual events (DELETE support)
