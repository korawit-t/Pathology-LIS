from pydantic import BaseModel
from typing import Optional


class CorrelationCreate(BaseModel):
    case_type: str = "nongyne"           # "gyne" | "nongyne"
    nongyne_case_id: Optional[int] = None
    gyne_case_id: Optional[int] = None
    surgical_accession_no: str
    surgical_case_id: Optional[int] = None
    cytology_diagnosis_snapshot: Optional[str] = None
    histology_diagnosis: Optional[str] = None
    correlation_result: str              # agree | minor_discrepancy | major_discrepancy | no_follow_up
    comment: Optional[str] = None


class CorrelationUpdate(BaseModel):
    histology_diagnosis: Optional[str] = None
    correlation_result: Optional[str] = None
    comment: Optional[str] = None
