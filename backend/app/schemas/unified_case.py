from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List, Optional


class UnifiedCaseItem(BaseModel):
    case_type: str  # "surgical" | "gyne" | "nongyne" | "molecular"
    id: int
    accession_no: str
    hn: Optional[str] = None
    patient_name: Optional[str] = None
    hospital_name: Optional[str] = None
    department_name: Optional[str] = None
    medical_scheme_name: Optional[str] = None
    specimen: Optional[str] = None
    status: str
    registered_at: Optional[datetime] = None
    clinician_name: Optional[str] = None
    is_express: bool = False
    consult: bool = False
    wf_grossed: bool = False
    wf_processed: bool = False
    wf_slide_prepped: bool = False
    wf_screened: bool = False
    wf_reported: bool = False

    model_config = ConfigDict(from_attributes=True)


class UnifiedCasePaginationResponse(BaseModel):
    items: List[UnifiedCaseItem]
    total: int
