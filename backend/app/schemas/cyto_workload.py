from pydantic import ConfigDict, BaseModel, field_validator
from datetime import date, datetime
from typing import Optional


class CytoWorkloadLogUpsert(BaseModel):
    user_id: int
    work_date: date
    reading_hours: float
    note: Optional[str] = None

    @field_validator("reading_hours")
    @classmethod
    def hours_positive(cls, v: float) -> float:
        if v < 0:
            raise ValueError("reading_hours must be >= 0")
        return v


class CytoWorkloadLogResponse(BaseModel):
    id: int
    user_id: int
    work_date: date
    reading_hours: float
    note: Optional[str] = None
    recorded_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CytoWorkloadDayStats(BaseModel):
    user_id: int
    user_full_name: str
    work_date: date
    gyne_slides: int
    nongyne_conv_slides: int
    nongyne_liquid_slides: int
    effective_count: float
    reading_hours: Optional[float]
    adjusted_limit: float
    is_compliant: bool
    note: Optional[str] = None
