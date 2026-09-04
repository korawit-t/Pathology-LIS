from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserMinResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NongyneDisposalBatchCreate(BaseModel):
    case_ids: List[int] = Field(..., min_length=1)
    disposer_id: int
    verifier_id: int
    approver_id: int
    # ไม่มี retention_days ให้ส่งเข้ามา — server อ่านจาก SystemSetting เอง
    # ถ้าให้ client กรอกได้ ก็เลี่ยงเกณฑ์ที่ใช้บล็อกได้ด้วยการส่ง 0 มา


class NongyneDisposalBatchConfirm(BaseModel):
    disposal_method: Optional[str] = None
    remark: Optional[str] = None


class NongyneDisposalBatchCancel(BaseModel):
    reason: Optional[str] = None


class NongyneDisposalBatchItemResponse(BaseModel):
    id: int
    case_id: int
    accession_no: Optional[str] = None
    hn: Optional[str] = None
    patient_name: Optional[str] = None
    specimen_type: Optional[str] = None
    collection_site: Optional[str] = None
    report_at: Optional[datetime] = None
    days_since_report: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class NongyneDisposalBatchResponse(BaseModel):
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
    items: List[NongyneDisposalBatchItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class NongyneDisposalBatchPagination(BaseModel):
    items: List[NongyneDisposalBatchResponse]
    total: int

    model_config = ConfigDict(from_attributes=True)
