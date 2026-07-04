# app/schemas/surgical_case.py
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.enums.quality_enum import QualityEnum
from app.schemas.surgical_specimen import (
    SurgicalSpecimenCreate,
    SurgicalSpecimenResponse,
)
from app.schemas.surgical_report import SurgicalReportResponse
from app.schemas.patient import PatientResponse
from app.schemas.organization import HospitalResponse, MedicalSchemeResponse, Department as DepartmentResponse
from app.schemas.user import UserResponse  # สมมติว่ามี schema user
from app.schemas.surgical_request_file import SurgicalRequestFileResponse

class SurgicalCaseBase(BaseModel):
    lab_number: Optional[str] = None
    hn: Optional[str] = None
    an: Optional[str] = None
    vn: Optional[str] = None

    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    medical_scheme_id: Optional[int] = None
    pathologist_id: Optional[int] = None

    clinical_diagnosis: Optional[str] = None
    clinician_name: Optional[str] = None
    is_express: bool = False
    is_frozen_section: bool = False
    status: Optional[str] = "registered"
    diagnosis_mode: Optional[str] = "individual"
    is_extended_fix: bool = False

    collect_at: Optional[datetime] = None

    # Quality & Storage
    stain_quality: Optional[QualityEnum] = None
    tissue_quality: Optional[QualityEnum] = None
    slide_quality: Optional[QualityEnum] = None

    specimen_storage_status: Optional[str] = None
    specimen_storage_container: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SurgicalCaseCreate(SurgicalCaseBase):
    patient_id: int
    registrar_id: int
    # รองรับการส่งชิ้นเนื้อมาพร้อมการสร้างเคส (Bulk Create Specimens)
    specimens: List[SurgicalSpecimenCreate] = []


class SurgicalCaseUpdate(BaseModel):
    hn: Optional[str] = None
    an: Optional[str] = None
    vn: Optional[str] = None
    lab_number: Optional[str] = None
    is_express: Optional[bool] = None
    is_frozen_section: Optional[bool] = None
    clinical_diagnosis: Optional[str] = None
    collect_at: Optional[datetime] = None

    status: Optional[str] = None
    diagnosis_mode: Optional[str] = None

    pathologist_id: Optional[int] = None
    gross_at: Optional[datetime] = None
    gross_examiner_id: Optional[int] = None
    gross_assistant_id: Optional[int] = None

    clinician_name: Optional[str] = None
    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    medical_scheme_id: Optional[int] = None

    # Workflow Flags
    is_extended_fix: Optional[bool] = None
    is_grossed: Optional[bool] = None
    is_processed: Optional[bool] = None
    is_slide_prepped: Optional[bool] = None
    is_reported: Optional[bool] = None

    has_malignancy: Optional[bool] = None
    has_critical: Optional[bool] = None
    is_pending: Optional[bool] = None
    pending_reason: Optional[str] = None
    is_out_lab_consult: Optional[bool] = None
    consult_status: Optional[str] = None
    consult_pdf_path: Optional[str] = None
    consult_report_out_at: Optional[datetime] = None
    consult_pdf_received_at: Optional[datetime] = None
    report_at: Optional[datetime] = None
    discard_status: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class SurgicalCaseResponse(SurgicalCaseBase):
    id: int
    accession_no: str
    patient_id: int
    registrar_id: int
    status: str
    diagnosis_mode: str

    # --- เพิ่มฟิลด์เหล่านี้เพื่อรองรับ Cancellation ---
    is_cancelled: bool
    cancelled_at: Optional[datetime] = None
    cancelled_by_id: Optional[int] = None
    cancel_reason: Optional[str] = None

    # ฟิลด์สถานะและเจ้าหน้าที่
    is_extended_fix: bool
    is_grossed: bool
    is_processed: bool
    is_slide_prepped: bool
    is_reported: bool
    is_pending: bool
    pending_reason: Optional[str] = None
    is_out_lab_consult: bool = False
    consult_status: Optional[str] = None
    consult_pdf_path: Optional[str] = None
    consult_report_out_at: Optional[datetime] = None
    consult_pdf_received_at: Optional[datetime] = None

    # Computed: whether any block on this case has ever had an IHC stain
    # ordered (see get_cases in crud/surgical_case.py — not a stored column).
    has_ihc: bool = False

    has_malignancy: Optional[bool] = None
    has_critical: Optional[bool] = None

    stain_quality: Optional[str] = None
    tissue_quality: Optional[str] = None
    slide_quality: Optional[str] = None

    registered_at: datetime
    collect_at: Optional[datetime] = None
    gross_at: Optional[datetime] = None
    report_at: Optional[datetime] = None
    current_signers: List[SurgicalReportResponse] = []
    user_signed_status: bool = False

    # Relationships
    patient: Optional[PatientResponse] = None
    hospital: Optional[HospitalResponse] = None
    department: Optional[DepartmentResponse] = None
    medical_scheme: Optional[MedicalSchemeResponse] = None
    specimens: List[SurgicalSpecimenResponse] = []

    # ข้อมูล User ที่เกี่ยวข้อง ( examiners / assistant )
    pathologist: Optional[UserResponse] = None
    gross_examiner: Optional[UserResponse] = None
    gross_assistant: Optional[UserResponse] = None
    registerer: Optional[UserResponse] = None
    
    specimen_storage_status: Optional[str] = None
    specimen_storage_container: Optional[str] = None
    specimen_storage_at: Optional[datetime] = None
    specimen_storage_by_id: Optional[int] = None
    specimen_storer: Optional[UserResponse] = None

    discard_status: bool = False
    discard_at: Optional[datetime] = None
    discard_by_id: Optional[int] = None
    specimen_disposer: Optional[UserResponse] = None

    reports: List[SurgicalReportResponse] = []
    request_files: List[SurgicalRequestFileResponse] = []

class SurgicalCasePaginationResponse(BaseModel):
    items: List[SurgicalCaseResponse]
    total: int

    model_config = ConfigDict(from_attributes=True)


class CaseCancelRequest(BaseModel):
    reason: str

class SpecimenStorageBulkUpdate(BaseModel):
    case_ids: List[int]
    container_number: str

class SpecimenDisposeBulkUpdate(BaseModel):
    case_ids: List[int]

# --- Cost Summary ---
class CostItem(BaseModel):
    test_id: int
    test_name: str
    category: str
    quantity: int
    unit_price: float
    total_price: float

    model_config = ConfigDict(from_attributes=True)

class CostSummaryResponse(BaseModel):
    items: List[CostItem]
    grand_total: float

    model_config = ConfigDict(from_attributes=True)


class CaseBillingSummary(BaseModel):
    case_id: int
    accession_no: str
    hn: Optional[str] = None
    patient_name: str
    status: str
    registered_at: datetime
    items: List[CostItem]
    grand_total: float

    model_config = ConfigDict(from_attributes=True)


class HospitalBillingResponse(BaseModel):
    items: List[CaseBillingSummary]
    total_cases: int
    all_cases_grand_total: float

    model_config = ConfigDict(from_attributes=True)
