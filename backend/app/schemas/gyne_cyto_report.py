from pydantic import ConfigDict, BaseModel
from datetime import datetime, date
from typing import Optional, List
from app.models.gyne_cyto_report import GyneReportStatus, GyneReportType


class GyneCytoReportBase(BaseModel):
    case_id: Optional[int] = None
    version_no: int = 1
    report_type: GyneReportType = GyneReportType.FINAL
    status: GyneReportStatus = GyneReportStatus.DRAFT

    # --- Patient Identifiers (Snapshot) ---
    accession_no: Optional[str] = None
    patient_title: Optional[str] = None
    patient_name: Optional[str] = None
    patient_hn: Optional[str] = None
    patient_cid: Optional[str] = None
    patient_birth_date: Optional[datetime] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None

    # --- Clinical Context ---
    hospital_name: Optional[str] = None
    hospital_id: Optional[int] = None
    department_name: Optional[str] = None
    clinician_name: Optional[str] = None

    # --- Medical Content (Snapshot) ---
    adequacy_text: Optional[str] = None
    endocervical_status_text: Optional[str] = None
    quality_text: Optional[str] = None
    category_1_text: Optional[str] = None
    category_2_text: Optional[str] = None
    
    interpretation: Optional[str] = None
    note: Optional[str] = None
    
    pathologist_name: Optional[str] = None

    # --- Identity & Footer Snapshots ---
    lab_name_snapshot: Optional[str] = None
    lab_address_snapshot: Optional[str] = None

    # --- Timestamps ---
    reported_at: Optional[datetime] = None


class GyneReportSignerBase(BaseModel):
    user_id: int
    role: str = "primary"
    signed_at: Optional[datetime] = None
    consult_note: Optional[str] = None
    agreement: Optional[str] = None
    agreement_note: Optional[str] = None


class GyneReportSignerCreate(GyneReportSignerBase):
    pass


class GyneReportSignerResponse(GyneReportSignerBase):
    id: int
    report_id: int
    assigned_at: datetime
    
    # Optional: Embed User details if needed for UI convenience, but usually we fetch separately or map in frontend
    # But let's add full_name for convenience
    user_full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GyneCytoReportCreate(GyneCytoReportBase):
    signers: Optional[List[GyneReportSignerCreate]] = None


class GyneCytoReportResponse(GyneCytoReportBase):
    id: int
    pathologist_id: Optional[int] = None
    is_print: bool = False
    published_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    signers: List[GyneReportSignerResponse] = []

    model_config = ConfigDict(from_attributes=True)


class GyneCytoReportPagination(BaseModel):
    items: List[GyneCytoReportResponse]
    total: int
    page: int
    size: int

    model_config = ConfigDict(from_attributes=True)
