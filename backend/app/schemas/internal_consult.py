from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List


class UserMiniResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    report_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InternalConsultCreate(BaseModel):
    case_type: str  # "surgical" | "gyne" | "nongyne"
    report_id: int
    consultant_id: int
    reason: str


class InternalConsultRespondRequest(BaseModel):
    opinion: str


class InternalConsultPromoteRequest(BaseModel):
    role: str = "co-signer"
    consult_note: Optional[str] = None


class InternalConsultResponse(BaseModel):
    id: int
    case_type: str
    report_id: int
    requester_id: int
    consultant_id: int
    reason: str
    opinion: Optional[str] = None
    accession_no_snapshot: Optional[str] = None
    status: str
    promoted_to_signer: bool
    created_at: datetime
    responded_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    requester: Optional[UserMiniResponse] = None
    consultant: Optional[UserMiniResponse] = None

    model_config = ConfigDict(from_attributes=True)


class InternalConsultListResponse(BaseModel):
    items: List[InternalConsultResponse]
    total: int
