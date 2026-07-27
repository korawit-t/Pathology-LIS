from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PerformedByInfo(BaseModel):
    id: int
    full_name: Optional[str] = None
    username: str

    model_config = ConfigDict(from_attributes=True)


class HEControlSlideResponse(BaseModel):
    id: int
    control_no: str
    control_date: date
    performed_by_id: int
    performed_by: Optional[PerformedByInfo] = None
    performed_at: datetime
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
