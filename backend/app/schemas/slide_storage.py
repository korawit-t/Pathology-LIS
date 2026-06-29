from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import List, Optional

class UserRef(BaseModel):
    id: int
    full_name: str
    model_config = ConfigDict(from_attributes=True)

# --- Detail Schemas ---
class SlideStorageDetailBase(BaseModel):
    stain_id: int
    storage_location: Optional[str] = None
    remark: Optional[str] = None

class CaseShortInfo(BaseModel):
    accession_no: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class SpecimenShortInfo(BaseModel):
    case: Optional[CaseShortInfo] = None
    
    model_config = ConfigDict(from_attributes=True)

class BlockShortInfo(BaseModel):
    block_code: Optional[str] = None
    specimen: Optional[SpecimenShortInfo] = None

    model_config = ConfigDict(from_attributes=True)

class TestShortInfo(BaseModel):
    id: int
    name: str
    category: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class SlideShortInfo(BaseModel):
    id: int
    slide_no: int
    status: str
    block: Optional[BlockShortInfo] = None
    test: Optional[TestShortInfo] = None

    model_config = ConfigDict(from_attributes=True)

class CytoStainShortInfo(BaseModel):
    """Shared short info for GyneCytologyStain and NongyneCytologyStain."""
    id: int
    slide_no: int
    status: str
    case: Optional[CaseShortInfo] = None
    test: Optional[TestShortInfo] = None

    model_config = ConfigDict(from_attributes=True)

class SlideStorageDetailCreate(SlideStorageDetailBase):
    pass

class RunShortInfo(BaseModel):
    id: int
    run_no: str
    stain_category: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class SlideStorageDetail(SlideStorageDetailBase):
    id: int
    run_id: int
    stored_at: datetime
    stain: Optional[SlideShortInfo] = None
    gyne_stain: Optional[CytoStainShortInfo] = None
    nongyne_stain: Optional[CytoStainShortInfo] = None
    discard_status: bool = False
    discard_at: Optional[datetime] = None
    discard_by: Optional[UserRef] = None
    run: Optional[RunShortInfo] = None

    model_config = ConfigDict(from_attributes=True)

class SlideDisposeRequest(BaseModel):
    detail_ids: List[int]

# --- Run Schemas ---
class SlideStorageRunBase(BaseModel):
    run_no: Optional[str] = None
    user_id: int
    stain_category: Optional[str] = None
    remark: Optional[str] = None

class SlideStorageRunCreate(SlideStorageRunBase):
    pass

class SlideStorageRun(SlideStorageRunBase):
    id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    details: List[SlideStorageDetail] = []
    operator: Optional[UserRef] = None
    discard_status: bool = False
    discard_at: Optional[datetime] = None
    discard_by: Optional[UserRef] = None

    model_config = ConfigDict(from_attributes=True)

class SlideStorageDisposeRequest(BaseModel):
    run_ids: List[int]

class SlideStorageDetailUpdate(BaseModel):
    storage_location: Optional[str] = None
    remark: Optional[str] = None

class SlideStorageRunCreateBatch(BaseModel):
    user_id: int
    stain_category: Optional[str] = None
    items: List[SlideStorageDetailCreate]
    remark: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
