from pydantic import ConfigDict, BaseModel
from typing import Optional, List
from datetime import datetime

# --- Image Base/Create ---
class GrossImageBase(BaseModel):
    image_url: str
    original_filename: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = 1
    show_in_report: Optional[bool] = True

class GrossImageCreate(GrossImageBase):
    # ไม่ต้องระบุ specimen_id ใน Create ถ้า API Endpoint เป็น /specimen/{id}/images
    pass 

class GrossImageUpdate(BaseModel):
    description: Optional[str] = None
    order: Optional[int] = None
    show_in_report: Optional[bool] = None

# --- Image Response ---
class GrossImageResponse(GrossImageBase):
    id: int
    specimen_id: int # FK
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)