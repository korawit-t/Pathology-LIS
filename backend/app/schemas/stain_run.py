from pydantic import BaseModel, ConfigDict  # แนะนำให้ใช้ ConfigDict ใน Pydantic V2
from typing import List, Optional
from datetime import datetime
from app.schemas.anatomical_pathology_test import AnatomicalPathologyTestResponse


# --- 1. สำหรับสร้าง Run (Payload) ---
class StainRunCreate(BaseModel):
    stain_ids: List[int]
    stainer_id: Optional[str] = None
    note: Optional[str] = None


# --- 2. ข้อมูลย้อนกลับไปหา Case/Specimen (สำหรับโชว์ในตารางรายละเอียด) ---
class SpecimenSchema(BaseModel):
    accession_no: Optional[str] = None  # ดึงมาจาก Case ผ่าน Relationship

    model_config = ConfigDict(from_attributes=True)


class BlockInfoSchema(BaseModel):
    block_code: str  # เช่น "A1"
    specimen: Optional[SpecimenSchema] = None

    model_config = ConfigDict(from_attributes=True)


class SlideInfoSchema(BaseModel):
    id: int
    test_id: int  # 🚩 เปลี่ยนให้ตรงกับ Model ใหม่
    test: Optional[AnatomicalPathologyTestResponse] = (
        None  # 🚩 ดึงชื่อสีย้อมจาก Master Data มาเลย
    )
    slide_no: int
    block: Optional[BlockInfoSchema] = None

    model_config = ConfigDict(from_attributes=True)


class RunDetailResponse(BaseModel):
    id: int
    stain_id: int
    stain_order: Optional[SlideInfoSchema] = None  # ข้อมูลสไลด์ + เคส + บล็อก

    model_config = ConfigDict(from_attributes=True)


# --- 3. สำหรับส่งข้อมูลออก (ประวัติการย้อม) ---
class StainRunResponse(BaseModel):
    id: int
    run_no: str
    stainer_id: Optional[str] = None
    operator_id: Optional[int] = None
    # user: Optional[UserSchema] = None # ถ้าอยากโชว์ชื่อคนรัน (Full Name) ให้ Join User มาด้วย
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None  # เปลี่ยนให้ตรงกับชื่อฟิลด์ใน Model

    details: List[RunDetailResponse] = []

    model_config = ConfigDict(from_attributes=True)


class StainRunUpdate(BaseModel):
    """Schema สำหรับอัปเดตข้อมูล Staining Run"""

    status: Optional[str] = None  # เช่น 'completed', 'cancelled'
    stainer_id: Optional[str] = None
    note: Optional[str] = None
    finished_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
