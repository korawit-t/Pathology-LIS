from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import Optional, List
from app.models.nongyne_cyto_report import NongyneReportStatus, NongyneReportType


class NongyneCytoReportBase(BaseModel):
    case_id: Optional[int] = None
    version_no: int = 1
    report_type: NongyneReportType = NongyneReportType.FINAL
    status: NongyneReportStatus = NongyneReportStatus.DRAFT

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
    clinical_history_snapshot: Optional[str] = None
    clinical_diagnosis_snapshot: Optional[str] = None

    # --- Specimen Info ---
    specimen_type: Optional[str] = None
    collection_site: Optional[str] = None

    # --- Diagnostic Content (Snapshot) ---
    microscopic_description: Optional[str] = None
    diagnosis: Optional[str] = None
    comment: Optional[str] = None
    has_malignancy: bool = False

    pathologist_name: Optional[str] = None

    # --- Identity & Footer Snapshots ---
    lab_name_snapshot: Optional[str] = None
    lab_address_snapshot: Optional[str] = None

    # --- Timestamps ---
    reported_at: Optional[datetime] = None


class NongyneReportSignerBase(BaseModel):
    user_id: int
    role: str = "primary"
    signed_at: Optional[datetime] = None
    consult_note: Optional[str] = None
    agreement: Optional[str] = None
    agreement_note: Optional[str] = None


class NongyneReportSignerCreate(NongyneReportSignerBase):
    pass


class NongyneReportSignerResponse(NongyneReportSignerBase):
    id: int
    report_id: int
    assigned_at: datetime
    user_full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NongyneCytoReportCreate(NongyneCytoReportBase):
    signers: Optional[List[NongyneReportSignerCreate]] = None


class NongyneCytoReportResponse(NongyneCytoReportBase):
    id: int
    pathologist_id: Optional[int] = None
    is_print: bool = False
    published_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    signers: List[NongyneReportSignerResponse] = []

    model_config = ConfigDict(from_attributes=True)


class NongyneCytoReportPagination(BaseModel):
    items: List[NongyneCytoReportResponse]
    total: int
    page: int
    size: int

    model_config = ConfigDict(from_attributes=True)
