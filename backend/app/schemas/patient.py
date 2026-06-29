from pydantic import ConfigDict, BaseModel
from datetime import date, datetime
from typing import Optional
from app.schemas.organization import TitleResponse


class PatientBase(BaseModel):
    title_id: Optional[int] = None
    name: str
    ln: Optional[str] = None
    gender: Optional[str] = None
    cid: Optional[str] = None  # ✅ cid

    birth_date: Optional[date] = None  # ใช้วันเกิดคำนวณอายุหน้าบ้านเอา


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    title_id: Optional[int] = None
    name: Optional[str] = None
    ln: Optional[str] = None
    gender: Optional[str] = None
    cid: Optional[str] = None
    birth_date: Optional[date] = None


class PatientResponse(PatientBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    hn: Optional[str] = None
    title: Optional[TitleResponse] = None

    model_config = ConfigDict(from_attributes=True)
