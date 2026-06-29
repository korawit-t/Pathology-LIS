from pydantic import ConfigDict, BaseModel, Field
from datetime import datetime
from typing import Optional, List, Literal


class UserMinResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StainInfo(BaseModel):
    name: str
    status: str


class BlockInfo(BaseModel):
    block_code: str
    stains: List[StainInfo] = []


class SpecimenInfo(BaseModel):
    specimen_label: str
    specimen_name: Optional[str] = None
    blocks: List[BlockInfo] = []


class CaseVerifyResponse(BaseModel):
    id: int
    accession_no: str
    patient_name: str
    patient_cid: Optional[str] = None
    case_type: Literal["SURGICAL", "GYNE_CYTO", "NONGYNE_CYTO"]
    is_slide_released: bool
    is_block_released: bool  # always False for non-Surgical
    # Physical materials
    specimens: List[SpecimenInfo] = []   # Surgical only
    stains: List[StainInfo] = []         # Gyne / NonGyne only

    model_config = ConfigDict(from_attributes=True)


class SlideBlockReleaseCreate(BaseModel):
    case_id: int
    case_type: Literal["SURGICAL", "GYNE_CYTO", "NONGYNE_CYTO"]
    release_type: Literal["SLIDE", "BLOCK", "BOTH"]
    recipient_name: str = Field(..., min_length=1, max_length=200)
    requester_name: Optional[str] = Field(None, max_length=200)
    reference_doc_no: Optional[str] = Field(None, max_length=100)
    remark: Optional[str] = None
    pathologist_id: Optional[int] = None
    pathologist_name: Optional[str] = Field(None, max_length=200)


class SlideBlockReleaseResponse(BaseModel):
    id: int
    release_no: str
    case_id: int
    case_type: str
    release_type: str
    recipient_name: str
    requester_name: Optional[str] = None
    reference_doc_no: Optional[str] = None
    remark: Optional[str] = None
    pathologist_id: Optional[int] = None
    pathologist_name: Optional[str] = None
    released_by_id: int
    released_at: datetime
    created_at: datetime
    released_by: Optional[UserMinResponse] = None
    pathologist: Optional[UserMinResponse] = None

    model_config = ConfigDict(from_attributes=True)


class SlideBlockReleasePagination(BaseModel):
    total: int
    items: List[SlideBlockReleaseResponse]
    skip: int
    limit: int
