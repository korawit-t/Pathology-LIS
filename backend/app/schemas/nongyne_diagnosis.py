from pydantic import ConfigDict, BaseModel
from typing import Optional, List, Any
from datetime import datetime

# Shared properties
class NongyneDiagnosisBase(BaseModel):
    gross_description: Optional[str] = None
    microscopic_description: Optional[str] = None
    diagnosis: Optional[str] = None
    comment: Optional[str] = None

# Create new diagnosis (usually Original)
class NongyneDiagnosisCreate(NongyneDiagnosisBase):
    case_id: int
    diagnosis_order: Optional[int] = None
    entry_type: str = "Original"

# Update existing diagnosis (Save draft / sign)
class NongyneDiagnosisUpdate(BaseModel):
    gross_description: Optional[str] = None
    microscopic_description: Optional[str] = None
    diagnosis: Optional[str] = None
    comment: Optional[str] = None
    status: Optional[str] = None
    signers: Optional[List[Any]] = None

# Schema for Revising or adding an Addendum
class NongyneDiagnosisRevise(NongyneDiagnosisBase):
    revision_reason: str
    entry_type: str = "Revised" # or "Addendum"

class NongyneDiagnosisResponse(NongyneDiagnosisBase):
    id: int
    case_id: int
    previous_version_id: Optional[int] = None
    diagnosis_order: int
    entry_type: str
    diagnosis_at: Optional[datetime] = None
    revision_reason: Optional[str] = None
    status: str
    is_current: bool = True
    signers: Optional[List[Any]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class NongyneDiagnosisHistoryResponse(BaseModel):
    # This might be used to group versions
    current_version: NongyneDiagnosisResponse
    history: List[NongyneDiagnosisResponse] = []

    model_config = ConfigDict(from_attributes=True)
