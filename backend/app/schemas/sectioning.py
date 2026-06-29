from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import List, Optional

# --- Detail Schemas ---
class SectioningDetailBase(BaseModel):
    block_id: int
    slide_count: int = 1
    is_recut: bool = False
    remark: Optional[str] = None

class BlockShortInfo(BaseModel):
    id: int
    block_no: int
    block_code: str    # ดึงจาก @property ใน Model
    accession_no: str  # ดึงจาก @property ใน Model
    is_decal: bool = False

    model_config = ConfigDict(from_attributes=True)

class SectioningDetailCreate(SectioningDetailBase):
    pass

class SectioningDetail(SectioningDetailBase):
    id: int
    run_id: int
    sectioned_at: datetime
    block: Optional[BlockShortInfo] = None

    model_config = ConfigDict(from_attributes=True)

# --- Run Schemas ---
class SectioningRunBase(BaseModel):
    run_no: Optional[str] = None
    user_id: int
    microtome_id: Optional[str] = None

class SectioningRunCreate(SectioningRunBase):
    pass

class SectioningRun(SectioningRunBase):
    id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    details: List[SectioningDetail] = []

    model_config = ConfigDict(from_attributes=True)

class SectioningDetailUpdate(BaseModel):
    slide_count: Optional[int] = None
    is_recut: Optional[bool] = None
    remark: Optional[str] = None

class SectioningBatchCreate(BaseModel):
    items: List[SectioningDetailCreate]

class SectioningRunCreateBatch(BaseModel):
    user_id: int
    microtome_id: str
    items: List[SectioningDetailCreate] # รายการตลับที่จะบันทึกพร้อมกัน
    remark: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
