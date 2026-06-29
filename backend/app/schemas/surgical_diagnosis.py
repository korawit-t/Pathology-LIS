from pydantic import ConfigDict, BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List
from app.enums.surgical_diagnosis_enums import (
    DiagnosisEntryType,
    DiagnosisLevel,
    DiagnosisStatus,
)


# --- 2. Supporting Schemas ---
class UserMinimal(BaseModel):
    id: int
    full_name: str
    report_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SpecimenMinimal(BaseModel):
    id: int
    label: Optional[str] = None
    specimen_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# --- 3. Base Schema ---
class SurgicalDiagnosisBase(BaseModel):
    case_id: int
    # 🚩 เปลี่ยนเป็น Optional เพราะถ้าเป็น CASE level จะใช้ linked_specimen_ids แทน
    surgical_specimen_id: Optional[int] = None

    # 🚩 เพิ่มฟิลด์ใหม่ที่เพิ่งอัปเดตใน Model
    diagnosis_level: DiagnosisLevel = DiagnosisLevel.SPECIMEN
    linked_specimen_ids: Optional[List[int]] = Field(
        default=None, description="List of specimen IDs for CASE level diagnosis"
    )

    microscopic_description: Optional[str] = None
    diagnosis: Optional[str] = None
    comment: Optional[str] = None
    diagnosis_order: Optional[int] = Field(
        1, description="Order number for grouping reports"
    )
    status: DiagnosisStatus = DiagnosisStatus.DRAFT


# --- 4. Create/Update Schemas ---
class SurgicalDiagnosisCreate(SurgicalDiagnosisBase):
    previous_version_id: Optional[int] = None
    entry_type: Optional[DiagnosisEntryType] = None
    diagnosis_order: Optional[int] = None
    revision_reason: Optional[str] = None

    @field_validator("revision_reason")
    @classmethod
    def check_revision_reason(cls, v, info):
        entry_type = info.data.get("entry_type")
        if (
            entry_type in [DiagnosisEntryType.REVISED, DiagnosisEntryType.CORRECTED]
            and not v
        ):
            raise ValueError(f"Revision reason is required for {entry_type} entries")
        return v

    # 🚩 เพิ่ม Validation สำหรับ Diagnosis Level
    @field_validator("linked_specimen_ids")
    @classmethod
    def validate_level_data(cls, v, info):
        level = info.data.get("diagnosis_level")
        if level == DiagnosisLevel.CASE and not v:
            raise ValueError(
                "linked_specimen_ids is required when diagnosis_level is 'CASE'"
            )
        return v


class SurgicalDiagnosisUpdate(BaseModel):
    diagnosis_level: Optional[DiagnosisLevel] = None
    linked_specimen_ids: Optional[List[int]] = None
    surgical_specimen_id: Optional[int] = None
    entry_type: Optional[DiagnosisEntryType] = None
    microscopic_description: Optional[str] = None
    diagnosis: Optional[str] = None
    comment: Optional[str] = None
    revision_reason: Optional[str] = None
    diagnosis_order: Optional[int] = None
    status: Optional[DiagnosisStatus] = None


# --- 5. Response Schema ---
class SurgicalDiagnosisResponse(SurgicalDiagnosisBase):
    id: int
    previous_version_id: Optional[int]
    entry_type: DiagnosisEntryType
    revision_reason: Optional[str]
    diagnosis_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    specimen: Optional[SpecimenMinimal] = None

    model_config = ConfigDict(from_attributes=True)
