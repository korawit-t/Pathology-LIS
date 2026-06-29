from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import Optional, List

# --- Schema พื้นฐานสำหรับความสัมพันธ์ ---


class BlockMin(BaseModel):
    id: int
    block_code: str

    model_config = ConfigDict(from_attributes=True)


class SpecimenMin(BaseModel):
    id: int
    blocks: List[BlockMin] = []

    model_config = ConfigDict(from_attributes=True)


class CaseInfoResponse(BaseModel):
    id: int
    accession_no: str
    specimens: List[SpecimenMin] = []

    model_config = ConfigDict(from_attributes=True)


class UserMinResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# --- 1. Schema สำหรับข้อมูล "รายการ" ในใบส่ง (Items) ---


class SlideDispatchItemResponse(BaseModel):
    id: int
    run_id: int
    case_id: int
    case_type: str
    status: str
    # ดึงข้อมูลเคสแบบ Nested
    surgical_case: Optional[CaseInfoResponse] = None
    gyne_cyto_case: Optional[CaseInfoResponse] = None
    nongyne_cyto_case: Optional[CaseInfoResponse] = None

    model_config = ConfigDict(from_attributes=True)


# --- 2. Schema สำหรับข้อมูล "หัวใบส่ง" (Run/Header) ---


class SlideDispatchRunResponse(BaseModel):
    id: int
    dispatch_no: str
    sender_id: int
    pathologist_id: int
    remark: Optional[str] = None
    total_cases: int
    sent_at: datetime

    # ข้อมูลความสัมพันธ์
    sender: Optional[UserMinResponse] = None
    pathologist: Optional[UserMinResponse] = None
    # 🚩 จุดสำคัญ: รายการเคสที่อยู่ในใบนี้
    items: List[SlideDispatchItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


# --- 3. Schema สำหรับ Pagination (ตัวที่ส่งกลับไปที่ Frontend) ---


class SlideDispatchPagination(BaseModel):
    total: int
    items: List[SlideDispatchRunResponse]  # 🚩 เปลี่ยนเป็น List ของ Runs
    skip: int
    limit: int


# --- 4. Schema สำหรับการ Create (Bulk) ---


class DispatchItemCreate(BaseModel):
    case_id: int
    case_type: str


class SlideDispatchBulkCreate(BaseModel):
    items: List[DispatchItemCreate]
    pathologist_id: int
    remark: Optional[str] = None
