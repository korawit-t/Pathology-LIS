from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserMinResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DisposalBatchCreate(BaseModel):
    case_ids: List[int] = Field(..., min_length=1)
    disposer_id: int
    verifier_id: int
    approver_id: int
    retention_days: Optional[int] = Field(default=None, ge=0)


class DisposalBatchConfirm(BaseModel):
    disposal_method: Optional[str] = None
    remark: Optional[str] = None


class DisposalBatchCancel(BaseModel):
    reason: Optional[str] = None


class DisposalBatchItemResponse(BaseModel):
    id: int
    case_id: int
    container_snapshot: Optional[str] = None
    accession_no: Optional[str] = None
    hn: Optional[str] = None
    patient_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DisposalBatchResponse(BaseModel):
    id: int
    batch_no: str
    status: Literal["PRINTED", "DISPOSED", "CANCELLED"]
    retention_days: Optional[int] = None
    disposal_method: Optional[str] = None
    remark: Optional[str] = None

    printed_at: Optional[datetime] = None
    printed_by: Optional[UserMinResponse] = None

    disposer_id: Optional[int] = None
    verifier_id: Optional[int] = None
    approver_id: Optional[int] = None
    disposer_name: Optional[str] = None
    verifier_name: Optional[str] = None
    approver_name: Optional[str] = None

    disposed_at: Optional[datetime] = None
    disposed_by: Optional[UserMinResponse] = None

    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[UserMinResponse] = None
    cancel_reason: Optional[str] = None

    item_count: int = 0
    items: List[DisposalBatchItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class DisposalBatchPagination(BaseModel):
    items: List[DisposalBatchResponse]
    total: int

    model_config = ConfigDict(from_attributes=True)
