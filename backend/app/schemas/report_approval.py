from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import Optional
from app.models.surgical_report import ReportStatus


# สำหรับรับค่าตอนกด Approve/Reject
class ReportApproveRequest(BaseModel):
    action: str  # "APPROVE" หรือ "REJECT"
    comment: Optional[str] = None
    agreement: Optional[str] = None # 'agree', 'disagree'
    agreement_note: Optional[str] = None # เหตุผลเพิ่มเติม


# สำหรับแสดงผลในประวัติ (Log)
class ApprovalLogResponse(BaseModel):
    id: int
    approver_name: Optional[str]
    action: str
    comment: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
