from pydantic import BaseModel, ConfigDict
from datetime import datetime, date
from typing import Optional, List, Any

# --- Sub-Schemas สำหรับ Response ---


class RequestFileResponse(BaseModel):
    id: int
    file_name: str
    file_type: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class HospitalMinimalResponse(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class DepartmentMinimalResponse(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class MedicalSchemeMinimalResponse(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class TitleMinimalResponse(BaseModel):
    id: int
    title: str
    model_config = ConfigDict(from_attributes=True)


class PatientMinimalResponse(BaseModel):
    id: int
    hn: Optional[str] = None
    name: str
    ln: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[date] = None
    cid: Optional[str] = None
    title: Optional[TitleMinimalResponse] = None
    model_config = ConfigDict(from_attributes=True)


class UserMinimalResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# --- Base Schema (ฟิลด์ที่มีร่วมกัน) ---


class GyneCytologyBase(BaseModel):
    accession_no: Optional[str] = None
    lab_number: Optional[str] = None
    hn: Optional[str] = None
    clinician_name: Optional[str] = None
    medical_scheme_id: Optional[int] = None
    collect_at: Optional[datetime] = None
    last_menstrual_period: Optional[date] = None
    is_postmenopausal: bool = False
    is_pregnant: bool = False
    specimen_type: str = "Conventional"
    collection_site: str = "Cervical/Endocervical"
    hormone_therapy: Optional[str] = None
    contraception: Optional[str] = None  # เพิ่มให้ครบตาม Model
    previous_abnormal_pap: bool = False  # เพิ่มให้ครบตาม Model
    clinical_diagnosis: Optional[str] = None
    clinical_history: Optional[str] = None


# --- Action Schemas ---


class GyneCytologyCaseCreate(GyneCytologyBase):
    patient_id: int
    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    pathologist_id: Optional[int] = None
    cytotechnologist_id: Optional[int] = None
    is_express: bool = False
    is_out_lab_consult: bool = False
    is_out_lab: bool = False
    # registrar_id จะถูกใส่ที่ CRUD/Route จาก current_user


class GyneCytologyCaseUpdate(BaseModel):
    # ข้อมูลทั่วไป (ทำให้ Optional ทั้งหมดเพื่อใช้ Patch)
    hn: Optional[str] = None
    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    clinician_name: Optional[str] = None
    collect_at: Optional[datetime] = None
    last_menstrual_period: Optional[date] = None
    is_postmenopausal: Optional[bool] = None
    is_pregnant: Optional[bool] = None
    specimen_type: Optional[str] = None
    collection_site: Optional[str] = None
    hormone_therapy: Optional[str] = None
    contraception: Optional[str] = None
    previous_abnormal_pap: Optional[bool] = None
    clinical_diagnosis: Optional[str] = None
    clinical_history: Optional[str] = None

    # ข้อมูล Workflow & ผลตรวจ
    status: Optional[str] = None
    pathologist_id: Optional[int] = None
    cytotechnologist_id: Optional[int] = None
    is_express: Optional[bool] = None
    bethesda_category: Optional[str] = None
    has_malignancy: Optional[bool] = None
    is_satisfied_specimen: Optional[bool] = None
    is_reported: Optional[bool] = None
    is_out_lab_consult: Optional[bool] = None
    is_out_lab: Optional[bool] = None
    out_lab_result_pdf_path: Optional[str] = None
    consult_status: Optional[str] = None
    consult_pdf_path: Optional[str] = None
    consult_reason: Optional[str] = None
    consult_report_out_at: Optional[datetime] = None
    consult_pdf_received_at: Optional[datetime] = None
    outlab_report_pdf_path: Optional[str] = None

    medical_scheme_id: Optional[int] = None
    slide_quality: Optional[str] = None
    stain_quality: Optional[str] = None


# --- Response Schemas ---


class GyneCytologyCaseResponse(GyneCytologyBase):
    id: int
    status: str
    registered_at: datetime
    registrar_id: int
    is_express: bool = False
    is_out_lab_consult: bool = False
    is_out_lab: bool = False
    out_lab_result_pdf_path: Optional[str] = None
    consult_status: Optional[str] = None
    consult_pdf_path: Optional[str] = None
    consult_reason: Optional[str] = None
    consult_report_out_at: Optional[datetime] = None
    consult_pdf_received_at: Optional[datetime] = None
    outlab_report_pdf_path: Optional[str] = None

    # QC Review
    needs_review: bool = False
    review_reason: Optional[str] = None
    reviewed_by_id: Optional[int] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[UserMinimalResponse] = None
    review_result: Optional[str] = None
    review_note: Optional[str] = None

    department_id: Optional[int] = None

    # Relationships (ข้อมูลที่โหลดแบบ Eager)
    patient: Optional[PatientMinimalResponse] = None
    hospital: Optional[HospitalMinimalResponse] = None
    department: Optional[DepartmentMinimalResponse] = None
    medical_scheme: Optional[MedicalSchemeMinimalResponse] = None
    pathologist: Optional[UserMinimalResponse] = None
    cytotechnologist: Optional[UserMinimalResponse] = None

    request_files: Optional[List[RequestFileResponse]] = None

    # Latest published report info (computed in crud)
    latest_report_id: Optional[int] = None
    report_is_read: Optional[bool] = None
    report_read_at: Optional[datetime] = None

    # Computed: whether a cyto-histo correlation exists
    has_correlation: Optional[bool] = None

    # Cancellation
    is_cancelled: bool = False
    cancelled_at: Optional[datetime] = None
    cancelled_by_id: Optional[int] = None
    cancel_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GyneCytologyListResponse(BaseModel):
    items: List[GyneCytologyCaseResponse]
    total: int
    model_config = ConfigDict(from_attributes=True)


class GyneCaseCancelRequest(BaseModel):
    reason: str
