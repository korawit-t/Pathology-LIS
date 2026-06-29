from pydantic import BaseModel, ConfigDict
from datetime import datetime, date
from typing import Optional, List

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

class NongyneCytologyBase(BaseModel):
    accession_no: Optional[str] = None
    lab_number: Optional[str] = None
    hn: Optional[str] = None
    an: Optional[str] = None
    vn: Optional[str] = None
    clinician_name: Optional[str] = None
    collect_at: Optional[datetime] = None
    clinical_diagnosis: Optional[str] = None
    clinical_history: Optional[str] = None
    specimen_type: str = "Fluid"
    collection_site: Optional[str] = None
    received_volume_ml: Optional[str] = None


# --- Action Schemas ---

class NongyneCytologyCaseCreate(NongyneCytologyBase):
    patient_id: int
    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    medical_scheme_id: Optional[int] = None
    pathologist_id: Optional[int] = None
    cytotechnologist_id: Optional[int] = None
    is_express: bool = False
    is_rose: bool = False
    is_out_lab_consult: bool = False
    is_out_lab: bool = False
    # registrar_id จะถูกใส่ที่ CRUD/Route จาก current_user


class NongyneCytologyCaseUpdate(BaseModel):
    # ข้อมูลทั่วไป (ทำให้ Optional ทั้งหมดเพื่อใช้ Patch)
    hn: Optional[str] = None
    an: Optional[str] = None
    vn: Optional[str] = None
    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    medical_scheme_id: Optional[int] = None
    clinician_name: Optional[str] = None
    collect_at: Optional[datetime] = None
    clinical_diagnosis: Optional[str] = None
    clinical_history: Optional[str] = None
    specimen_type: Optional[str] = None
    collection_site: Optional[str] = None
    received_volume_ml: Optional[str] = None

    # ข้อมูล Workflow & ผลตรวจ
    status: Optional[str] = None
    pathologist_id: Optional[int] = None
    cytotechnologist_id: Optional[int] = None
    is_express: Optional[bool] = None
    is_rose: Optional[bool] = None
    has_malignancy: Optional[bool] = None
    is_satisfied_specimen: Optional[bool] = None
    is_screened: Optional[bool] = None
    is_reported: Optional[bool] = None
    is_out_lab_consult: Optional[bool] = None
    is_out_lab: Optional[bool] = None
    out_lab_result_pdf_path: Optional[str] = None
    consult_status: Optional[str] = None
    consult_pdf_path: Optional[str] = None

    # Cell Block
    is_cell_block: Optional[bool] = None
    cell_block_status: Optional[str] = None
    cell_block_prepared_at: Optional[datetime] = None
    cell_block_prepared_by_id: Optional[int] = None

    slide_quality: Optional[str] = None
    stain_quality: Optional[str] = None


# --- Response Schemas ---

class NongyneCytologyCaseResponse(NongyneCytologyBase):
    id: int
    status: str
    registered_at: datetime
    registrar_id: int
    is_express: bool = False
    is_screened: bool = False
    is_reported: bool = False
    is_pending: bool = False
    is_out_lab_consult: bool = False
    is_out_lab: bool = False
    out_lab_result_pdf_path: Optional[str] = None
    consult_status: str = "pending"
    consult_pdf_path: Optional[str] = None

    # Cell Block
    is_cell_block: bool = False
    cell_block_status: Optional[str] = None
    cell_block_prepared_at: Optional[datetime] = None
    cell_block_prepared_by_id: Optional[int] = None
    cell_block_prepared_by: Optional[UserMinimalResponse] = None
    
    patient_id: int
    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    medical_scheme_id: Optional[int] = None
    pathologist_id: Optional[int] = None
    cytotechnologist_id: Optional[int] = None

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

    slide_quality: Optional[str] = None
    stain_quality: Optional[str] = None

    # Computed: whether a cyto-histo correlation exists for this case
    has_correlation: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class NongyneCytologyListResponse(BaseModel):
    items: List[NongyneCytologyCaseResponse]
    total: int
    model_config = ConfigDict(from_attributes=True)
