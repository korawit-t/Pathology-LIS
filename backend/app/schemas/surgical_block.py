from pydantic import ConfigDict, BaseModel
from typing import List, Optional, TYPE_CHECKING
from datetime import datetime
from app.schemas.surgical_specimen import SurgicalSpecimenResponse


# 1. ใช้ TYPE_CHECKING เพื่อให้ IDE รู้จัก Type ตอนเขียนโค้ด
# แต่ตอนรันจริง Python จะข้ามบรรทัดนี้ไป ทำให้ไม่เกิด Circular Import
if TYPE_CHECKING:
    from app.schemas.surgical_block_stain import StainResponse


class SurgicalBlockBase(BaseModel):
    specimen_id: int
    block_no: int
    is_decal: bool = False
    is_fixing: bool = False
    status: str = "grossed"
    tissue_count: Optional[int] = None
    is_tissue_uncountable: bool = False
    tissue_description: Optional[str] = None


class SurgicalBlockCreate(SurgicalBlockBase):
    pass


class SurgicalBlockUpdate(BaseModel):
    block_no: Optional[int] = None
    is_decal: Optional[bool] = None
    is_fixing: Optional[bool] = None
    status: Optional[str] = None
    fix_start_at: Optional[datetime] = None
    fix_start_by_id: Optional[int] = None
    fix_end_at: Optional[datetime] = None
    fix_end_by_id: Optional[int] = None
    decal_start_at: Optional[datetime] = None
    decal_start_by_id: Optional[int] = None
    decal_end_at: Optional[datetime] = None
    decal_end_by_id: Optional[int] = None
    tissue_count: Optional[int] = None
    is_tissue_uncountable: Optional[bool] = None
    tissue_description: Optional[str] = None


class SurgicalBlockResponse(SurgicalBlockBase):
    id: int
    specimen_label: str
    block_code: str
    accession_no: Optional[str] = None
    specimen_name: Optional[str] = None
    # ❌ ลบหรือ Comment บรรทัดนี้ออกเพื่อตัดวงจร Loop
    # specimen: Optional[SurgicalSpecimenResponse] = None

    # 2. ใช้ String Forward Reference "StainResponse"
    # เพื่อบอก Pydantic ว่า "เดี๋ยวฉันจะบอกทีหลังว่าหน้าตาตัวนี้เป็นยังไง"
    stains: List["StainResponse"] = []

    fix_start_at: Optional[datetime] = None
    fix_start_by_id: Optional[int] = None
    fix_end_at: Optional[datetime] = None
    fix_end_by_id: Optional[int] = None
    decal_start_at: Optional[datetime] = None
    decal_start_by_id: Optional[int] = None
    decal_end_at: Optional[datetime] = None
    decal_end_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BlockPaginationResponse(BaseModel):
    items: List[
        SurgicalBlockResponse
    ]  # ✅ แก้จาก SurgicalBlockSchema เป็น SurgicalBlockResponse
    total: int


# 3. ท้ายไฟล์: ค่อย Import ของจริงมาเพื่อทำ model_rebuild
# การ Import ตรงนี้จะไม่พังเพราะ Class SurgicalBlockResponse ถูกสร้างเสร็จแล้ว
from app.schemas.surgical_block_stain import StainResponse

SurgicalBlockResponse.model_rebuild()
BlockPaginationResponse.model_rebuild()
