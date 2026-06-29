from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime
from typing import Optional, List


# --- Schema สำหรับ Master Data ---
class APTestSimple(BaseModel):
    id: int
    name: str
    price_tier_1: float
    category: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# --- Schema สำหรับการจัดการ Stain ---
class NongyneStainBase(BaseModel):
    test_id: Optional[int] = None
    slide_no: int = 1
    status: str = "pending"


class NongyneStainCreate(NongyneStainBase):
    case_id: int


class NongyneStainUpdate(BaseModel):
    status: Optional[str] = None
    is_printed: Optional[bool] = None
    test_id: Optional[int] = None
    slide_no: Optional[int] = None


class NongyneStainResponse(BaseModel):
    id: int
    case_id: int
    test_id: Optional[int]
    slide_no: int
    status: str
    is_printed: bool
    printed_at: Optional[datetime] = None

    # 🚩 ข้อมูลจาก Master Data (ดึงผ่าน Relationship)
    test: Optional[APTestSimple] = None

    # 🚩 ดึง Accession No จาก Case
    accession_no: Optional[str] = None

    @field_validator("accession_no", mode="before")
    @classmethod
    def get_accession_from_case(cls, v, info):
        return v

    model_config = ConfigDict(from_attributes=True)


# --- Schema สำหรับการจัดการ Batch Run (ย้อมเป็นกลุ่ม) ---
class NongyneStainRunCreate(BaseModel):
    stainer_id: str
    stain_ids: List[int]
    run_name: Optional[str] = None
