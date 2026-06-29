# app/schemas/microscopic_image.py
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class MicroscopicImageBase(BaseModel):
    image_url: str
    original_filename: Optional[str] = None  # 🚩 เพิ่มฟิลด์นี้เพื่อให้ตรงกับใน Router/CRUD
    magnification: Optional[str] = None
    stain: Optional[str] = None
    description: Optional[str] = None
    sort_order: int = 1
    show_in_report: Optional[bool] = True

# 🚩 เพิ่มคลาสนี้เข้าไปครับ
class MicroscopicImageCreate(MicroscopicImageBase):
    pass  # ใช้ฟิลด์เหมือน Base ทุกอย่างสำหรับจังหวะ Create


class MicroscopicImageResponse(MicroscopicImageBase):
    id: int
    specimen_id: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)


# 🚩 เพิ่มคลาสนี้เพื่อให้รองรับการ Update แบบบางฟิลด์ (Optional)
class MicroscopicImageUpdate(BaseModel):
    magnification: Optional[str] = None
    stain: Optional[str] = None
    description: Optional[str] = None
    specimen_id: Optional[int] = None  # 🚩 เพิ่มตัวนี้เพื่อให้ย้ายชิ้นเนื้อที่ผูกกับรูปได้
    sort_order: Optional[int] = None
    show_in_report: Optional[bool] = None


class MicroscopicImageResponse(MicroscopicImageBase):
    id: int
    specimen_id: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)
