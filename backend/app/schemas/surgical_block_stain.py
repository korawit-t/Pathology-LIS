from pydantic import BaseModel, model_validator, ConfigDict
from typing import Optional, List
from datetime import datetime


# --- Master Data Schema ---
class APTestSimple(BaseModel):
    id: int
    name: str
    category: str
    price_tier_1: float
    is_external: bool = False
    model_config = ConfigDict(from_attributes=True)


# --- Block Info (Flattened) ---
class BlockShortInfo(BaseModel):
    id: int
    block_no: int
    accession_no: Optional[str] = None
    block_code: Optional[str] = None
    status: str
    model_config = ConfigDict(from_attributes=True)


# --- Stain Order Details ---
class StainBase(BaseModel):
    block_id: int
    test_id: Optional[int] = None
    slide_no: int = 1


class StainCreate(StainBase):
    """ใช้สำหรับสร้างรายการย้อมใหม่"""

    test_id: Optional[int] = None  # nullable for recut orders without a specific test
    is_recut: bool = False
    recut_note: Optional[str] = None
    # Molecular-category orders only — not a SurgicalBlockStain column, excluded
    # from the dict before constructing the model (see crud.create_stain).
    assist_pathologist_id: Optional[int] = None


class StainUpdate(BaseModel):
    """ใช้สำหรับอัปเดตสถานะหรือข้อมูลสไลด์"""

    status: Optional[str] = None
    is_printed: Optional[bool] = None
    stain_name: Optional[str] = None
    slide_no: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


class StainedByInfo(BaseModel):
    id: int
    full_name: Optional[str] = None
    username: str
    model_config = ConfigDict(from_attributes=True)


class StainResponse(StainBase):
    id: int
    status: str
    is_printed: bool
    printed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    stained_by: Optional[StainedByInfo] = None
    test: Optional[APTestSimple] = None
    # ดึงข้อมูลผ่าน Model Property / Relationship
    accession_no: Optional[str] = None
    block_code: Optional[str] = None
    block: Optional[BlockShortInfo] = None
    is_recut: bool = False
    recut_note: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class StainShortResponse(BaseModel):
    id: int
    test_id: Optional[int] = None
    status: str
    block_code: Optional[str] = None
    accession_no: Optional[str] = None
    test_name: Optional[str] = None
    test_category: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# --- Staining Run Details (The bridge between Run and Stain Order) ---
class StainingRunDetailResponse(BaseModel):
    id: int
    stain_id: int
    stain_run_id: int
    is_success: bool
    remark: Optional[str] = None
    # ฟิลด์ที่จะถูกเติมด้วย Validator
    accession_no: Optional[str] = None
    block_code: Optional[str] = None
    stain_order: Optional[StainResponse] = None

    @model_validator(mode="after")
    def set_flattened_fields(self):
        if self.stain_order:
            # ดึงข้อมูลจากก้อนความสัมพันธ์มาแปะไว้ชั้นนอกให้ Frontend ใช้ง่ายๆ
            if self.stain_order.block:
                self.block_code = self.stain_order.block.block_code
            self.accession_no = self.stain_order.accession_no
        return self

    model_config = ConfigDict(from_attributes=True)


# --- Operator Info ---
class OperatorInfo(BaseModel):
    id: int
    full_name: Optional[str] = None
    username: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# --- Staining Run (Header) ---
class StainingRunResponse(BaseModel):
    id: int
    run_no: str
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    stainer_id: Optional[str] = None
    operator_id: Optional[int] = None
    operator: Optional[OperatorInfo] = None
    details: List[StainingRunDetailResponse] = []
    model_config = ConfigDict(from_attributes=True)

# --- Outlab Run Details ---
class OutlabRunDetailResponse(BaseModel):
    id: int
    stain_id: int
    outlab_run_id: int
    is_success: bool
    remark: Optional[str] = None
    accession_no: Optional[str] = None
    block_code: Optional[str] = None
    block_id: Optional[int] = None
    received_at: Optional[datetime] = None
    received_by_id: Optional[int] = None
    is_hosxp_keyed: bool = False
    hosxp_keyed_at: Optional[datetime] = None
    stain_order: Optional[StainResponse] = None

    @model_validator(mode="after")
    def set_flattened_fields(self):
        if self.stain_order:
            self.block_id = self.stain_order.block_id
            if self.stain_order.block:
                self.block_code = self.stain_order.block.block_code
            self.accession_no = self.stain_order.accession_no
        return self

    model_config = ConfigDict(from_attributes=True)

# --- Outlab Run (Header) ---
class OutlabRunCreate(BaseModel):
    destination_lab: str
    stain_ids: List[int]
    tracking_number: Optional[str] = None

class OutlabRunUpdate(BaseModel):
    tracking_number: Optional[str] = None

class OutlabRunReceiveDetails(BaseModel):
    detail_ids: List[int]

class OutlabRunResponse(BaseModel):
    id: int
    run_no: str
    status: str
    destination_lab: Optional[str] = None
    sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    operator_id: Optional[int] = None
    received_by_id: Optional[int] = None
    tracking_number: Optional[str] = None
    details: List[OutlabRunDetailResponse] = []
    model_config = ConfigDict(from_attributes=True)
