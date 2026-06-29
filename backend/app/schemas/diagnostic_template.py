from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class DiagnosticTemplateBase(BaseModel):
    name: str
    diagnosis_content: str
    microscopic_content: Optional[str] = None  # เพิ่มส่วนนี้
    category: Optional[str] = "General"
    is_active: bool = True


class DiagnosticTemplateCreate(DiagnosticTemplateBase):
    pass


class DiagnosticTemplateUpdate(BaseModel):
    name: Optional[str] = None
    diagnosis_content: Optional[str] = None
    microscopic_content: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


class DiagnosticTemplateResponse(DiagnosticTemplateBase):
    id: int
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
