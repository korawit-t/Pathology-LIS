from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List, Any

class BlockTemplateItem(BaseModel):
    tissue_description: Optional[str] = None
    tissue_count: Optional[int] = None
    is_tissue_uncountable: bool = False

# --- Schema พื้นฐานสำหรับใช้ร่วมกัน ---
class GrossTemplateBase(BaseModel):
    name: str
    raw_content: str
    category: Optional[str] = "General"
    is_active: Optional[bool] = True
    block_templates: Optional[List[BlockTemplateItem]] = None

# --- สำหรับรับข้อมูลตอน Create (POST) ---
class GrossTemplateCreate(GrossTemplateBase):
    pass

# --- สำหรับรับข้อมูลตอน Update (PUT/PATCH) ---
class GrossTemplateUpdate(BaseModel):
    name: Optional[str] = None
    raw_content: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    block_templates: Optional[List[BlockTemplateItem]] = None

# --- สำหรับส่งข้อมูลกลับไปยัง React (Response) ---
class GrossTemplateResponse(GrossTemplateBase):
    id: int
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    # เชื่อมโยงข้อมูล User (ถ้าต้องการส่งชื่อคนสร้างกลับไปด้วย)
    # creator_name: Optional[str] = None 

    model_config = ConfigDict(from_attributes=True) # สำหรับ SQLAlchemy Compatibility

# --- สำหรับจัดการ List ของ Templates ---
class GrossTemplateList(BaseModel):
    total: int
    items: List[GrossTemplateResponse]