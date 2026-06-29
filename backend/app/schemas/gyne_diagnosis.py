from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime
from typing import Optional, List


# --- Master Data Schemas ---

class GyneSpecimenAdequacyBase(BaseModel):
    id: int
    group_type: str
    text: str
    code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GyneDiagnosisCategoryBase(BaseModel):
    id: int
    code: str
    text: str
    parent_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# --- Diagnosis Schemas ---

class GyneSignerSchema(BaseModel):
    user_id: int
    role: str = "primary"
    signed_at: Optional[datetime] = None


class GyneDiagnosisBase(BaseModel):
    # Old text fields (Keep optional or deprecate)
    adequacy: Optional[str] = None
    category: Optional[str] = None
    interpretation: Optional[str] = None
    note: Optional[str] = None
    revised_reason: Optional[str] = None

    # New structured fields
    adequacy_id: Optional[int] = None
    endocervical_status_id: Optional[int] = None
    quality_id: Optional[int] = None
    category_1_id: Optional[int] = None
    category_2_id: Optional[int] = None
    
    signers: Optional[List[GyneSignerSchema]] = []


class GyneDiagnosisCreate(GyneDiagnosisBase):
    case_id: int


class GyneDiagnosisUpdate(BaseModel):
    # Free text fields
    adequacy: Optional[str] = None
    category: Optional[str] = None
    interpretation: Optional[str] = None
    note: Optional[str] = None
    
    # New structured fields
    adequacy_id: Optional[int] = None
    endocervical_status_id: Optional[int] = None
    quality_id: Optional[int] = None
    category_1_id: Optional[int] = None
    category_2_id: Optional[int] = None
    
    signers: Optional[List[GyneSignerSchema]] = None

    revised_reason: Optional[str] = None

    @field_validator("revised_reason")
    @classmethod
    def reason_must_not_be_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v or len(v.strip()) < 5:
                raise ValueError("Revised reason must be at least 5 characters long")
        return v


class GyneDiagnosisResponse(GyneDiagnosisBase):
    id: int
    case_id: int
    version: int
    is_current: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Relationships (Optional: include if needed for display)
    adequacy_obj: Optional[GyneSpecimenAdequacyBase] = None
    endocervical_status_obj: Optional[GyneSpecimenAdequacyBase] = None
    quality_obj: Optional[GyneSpecimenAdequacyBase] = None
    category_1_obj: Optional[GyneDiagnosisCategoryBase] = None
    category_2_obj: Optional[GyneDiagnosisCategoryBase] = None

    model_config = ConfigDict(from_attributes=True)

