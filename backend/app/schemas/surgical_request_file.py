from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserResponse


class SurgicalRequestFileBase(BaseModel):
    file_name: str
    file_type: str


class SurgicalRequestFileCreate(SurgicalRequestFileBase):
    case_id: int
    file_path: str


class SurgicalRequestFileResponse(SurgicalRequestFileBase):
    id: int
    case_id: int
    file_path: str
    uploaded_at: datetime
    uploaded_by_id: int
    uploader: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)
