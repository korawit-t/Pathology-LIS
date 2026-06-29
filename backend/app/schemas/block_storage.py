from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import List, Optional

class UserRef(BaseModel):
    id: int
    full_name: str
    model_config = ConfigDict(from_attributes=True)

# --- Detail Schemas ---
class BlockStorageDetailBase(BaseModel):
    block_id: int
    storage_location: Optional[str] = None
    remark: Optional[str] = None

class BlockShortInfo(BaseModel):
    id: int
    block_no: int
    block_code: str    # ดึงจาก @property ใน Model
    accession_no: str  # ดึงจาก @property ใน Model

    model_config = ConfigDict(from_attributes=True)

class BlockStorageDetailCreate(BlockStorageDetailBase):
    pass

class RunShortInfo(BaseModel):
    id: int
    run_no: str
    model_config = ConfigDict(from_attributes=True)

class BlockStorageDetail(BlockStorageDetailBase):
    id: int
    run_id: int
    stored_at: datetime
    block: Optional[BlockShortInfo] = None
    # disposal
    discard_status: bool = False
    discard_at: Optional[datetime] = None
    discard_by: Optional[UserRef] = None
    run: Optional[RunShortInfo] = None

    model_config = ConfigDict(from_attributes=True)

class BlockDisposeRequest(BaseModel):
    detail_ids: List[int]

# --- Run Schemas ---
class BlockStorageRunBase(BaseModel):
    run_no: Optional[str] = None
    user_id: int
    remark: Optional[str] = None

class BlockStorageRunCreate(BlockStorageRunBase):
    pass

class BlockStorageRun(BlockStorageRunBase):
    id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    details: List[BlockStorageDetail] = []
    operator: Optional[UserRef] = None
    discard_status: bool = False
    discard_at: Optional[datetime] = None
    discard_by: Optional[UserRef] = None

    model_config = ConfigDict(from_attributes=True)

class BlockStorageDisposeRequest(BaseModel):
    run_ids: List[int]

class BlockStorageDetailUpdate(BaseModel):
    storage_location: Optional[str] = None
    remark: Optional[str] = None

class BlockStorageRunCreateBatch(BaseModel):
    user_id: int
    items: List[BlockStorageDetailCreate] # รายการตลับที่จะจัดเก็บพร้อมกัน
    remark: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
