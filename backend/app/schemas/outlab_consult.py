from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List, Optional


class CaseSelection(BaseModel):
    case_type: str
    case_id: int
    accession_no: Optional[str] = None
    patient_name: Optional[str] = None
    block_code: Optional[str] = None


class OutlabConsultRunCreate(BaseModel):
    destination_lab: str
    cases: List[CaseSelection]


class OutlabConsultRunDetailResponse(BaseModel):
    id: int
    run_id: int
    case_type: str
    case_id: int
    accession_no: Optional[str] = None
    patient_name: Optional[str] = None
    block_code: Optional[str] = None
    report_out_at: Optional[datetime] = None
    remark: Optional[str] = None
    created_at: datetime
    block_returned: bool = False
    block_returned_at: Optional[datetime] = None
    block_returned_by_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class OutlabConsultRunResponse(BaseModel):
    id: int
    run_no: str
    destination_lab: Optional[str] = None
    operator_id: Optional[int] = None
    sent_at: datetime
    status: str
    received_at: Optional[datetime] = None
    received_by_id: Optional[int] = None
    tracking_number: Optional[str] = None
    details: List[OutlabConsultRunDetailResponse] = []

    model_config = ConfigDict(from_attributes=True)


class OutlabConsultRunUpdateTracking(BaseModel):
    tracking_number: Optional[str] = None
