from pydantic import BaseModel
from typing import Optional


class SurgicalCaseCorrelationCreate(BaseModel):
    from_case_id: int
    to_case_id: int
    from_accession_no: str
    to_accession_no: str
    correlation_result: str   # agree | minor_discrepancy | major_discrepancy | no_follow_up
    comment: Optional[str] = None


class SurgicalCaseCorrelationUpdate(BaseModel):
    correlation_result: Optional[str] = None
    comment: Optional[str] = None
