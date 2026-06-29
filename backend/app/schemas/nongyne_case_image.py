from pydantic import ConfigDict, BaseModel
from typing import Optional
from datetime import datetime


class NongyneCaseImageCreate(BaseModel):
    image_url: str
    original_filename: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = 1
    show_in_report: Optional[bool] = True


class NongyneCaseImageUpdate(BaseModel):
    description: Optional[str] = None
    order: Optional[int] = None
    show_in_report: Optional[bool] = None


class NongyneCaseImageResponse(NongyneCaseImageCreate):
    id: int
    case_id: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)
