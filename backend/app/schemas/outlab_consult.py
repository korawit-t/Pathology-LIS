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

    # Live status of the underlying case (not a stored column — attached at
    # query time in get_consult_runs) so the UI can show this specific case's
    # own progress instead of the shipment run's overall "sent"/"received" status.
    case_consult_status: Optional[str] = None
    # Whether the underlying case already has a consult_pdf_path uploaded
    # (also attached at query time) — lets the UI offer "View PDF" instead of
    # only "Upload PDF" once a report has come back for this case.
    consult_pdf_uploaded: bool = False

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
