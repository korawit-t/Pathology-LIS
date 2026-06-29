from pydantic import ConfigDict, BaseModel
from typing import Optional
from datetime import datetime


class GyneCaseImageCreate(BaseModel):
    image_url: str
    original_filename: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = 1
    show_in_report: Optional[bool] = True


class GyneCaseImageUpdate(BaseModel):
    description: Optional[str] = None
    order: Optional[int] = None
    show_in_report: Optional[bool] = None


class GyneCaseImageResponse(GyneCaseImageCreate):
    id: int
    case_id: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)
