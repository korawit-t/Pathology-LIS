from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

CaseType = Literal["surgical", "gyne", "nongyne"]


class OutlabConsultRequestCreate(BaseModel):
    case_type: CaseType
    case_id: int
    reason: Optional[str] = None
    destination_lab: Optional[str] = None


class OutlabConsultRequestCancel(BaseModel):
    reason: Optional[str] = None


class OutlabConsultRequestUpdate(BaseModel):
    destination_lab: Optional[str] = None
    external_ref: Optional[str] = None
    external_pathologist: Optional[str] = None
    concordance: Optional[Literal["concordant", "minor_discordant", "major_discordant"]] = None
    reason: Optional[str] = None


class OutlabConsultRequestResponse(BaseModel):
    """result_pdf_path and pdf_thumbnails are deliberately not here: the file
    is fetched through GET /outlab-consults/{id}/result-pdf, and the page
    images are only for the printed cover."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_type: str
    case_id: int
    seq: int
    consult_no: str
    status: str
    reason: Optional[str] = None
    destination_lab: Optional[str] = None
    requested_by_id: Optional[int] = None
    requested_by_name: Optional[str] = None
    requested_at: Optional[datetime] = None
    has_result_pdf: bool = False
    result_received_at: Optional[datetime] = None
    external_ref: Optional[str] = None
    external_pathologist: Optional[str] = None
    concordance: Optional[str] = None
    approved_by_id: Optional[int] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    reported_in_report_id: Optional[int] = None
    reported_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None


def _display_name(user) -> Optional[str]:
    return (user.report_name or user.full_name) if user else None


def to_response(consult) -> OutlabConsultRequestResponse:
    data = OutlabConsultRequestResponse.model_validate(consult)
    data.requested_by_name = _display_name(consult.requested_by)
    data.approved_by_name = _display_name(consult.approved_by)
    data.has_result_pdf = bool(consult.result_pdf_path)
    return data
