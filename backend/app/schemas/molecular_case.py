from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class MolecularCaseCreate(BaseModel):
    """Standalone registration — no parent Surgical case. Mirrors the base
    fields SurgicalCaseCreate/NongyneCytologyCaseCreate collect at intake."""

    patient_id: int
    ap_test_id: int
    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    medical_scheme_id: Optional[int] = None
    hn: Optional[str] = None
    an: Optional[str] = None
    vn: Optional[str] = None
    clinical_diagnosis: Optional[str] = None
    clinician_name: Optional[str] = None
    collect_at: Optional[datetime] = None
    assist_pathologist_id: Optional[int] = None


class MolecularCaseUpdate(BaseModel):
    result_text: Optional[str] = None
    is_outlab: Optional[bool] = None

    # Editable regardless of origin (parent-linked or standalone) — not part
    # of _DEMOGRAPHIC_FIELDS below, unlike the registration/demographic fields.
    assist_pathologist_id: Optional[int] = None

    # Standalone-only registration/demographic fields — rejected by the CRUD
    # layer if the case has a parent_case_id (see update_molecular_case).
    patient_id: Optional[int] = None
    ap_test_id: Optional[int] = None
    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    medical_scheme_id: Optional[int] = None
    hn: Optional[str] = None
    an: Optional[str] = None
    vn: Optional[str] = None
    clinical_diagnosis: Optional[str] = None
    clinician_name: Optional[str] = None
    collect_at: Optional[datetime] = None


class MolecularCaseFinalize(BaseModel):
    result_text: Optional[str] = None


class MolecularCaseCancel(BaseModel):
    cancel_reason: Optional[str] = None


class MolecularTitleRef(BaseModel):
    id: int
    title: str
    model_config = ConfigDict(from_attributes=True)


class MolecularPatientRef(BaseModel):
    id: int
    hn: Optional[str] = None
    name: str
    ln: Optional[str] = None
    gender: Optional[str] = None
    cid: Optional[str] = None
    title: Optional[MolecularTitleRef] = None
    model_config = ConfigDict(from_attributes=True)


class MolecularCaseResponse(BaseModel):
    id: int
    accession_no: str
    parent_case_id: Optional[int] = None
    parent_case_accession_no: Optional[str] = None
    patient_name: Optional[str] = None
    hn: Optional[str] = None
    stain_id: Optional[int] = None
    ap_test_id: int
    test_name: Optional[str] = None
    status: str
    is_outlab: bool
    result_text: Optional[str] = None
    outlab_pdf_path: Optional[str] = None
    outlab_pdf_received_at: Optional[datetime] = None
    registrar_id: int
    registered_at: Optional[datetime] = None
    reported_by_id: Optional[int] = None
    reported_at: Optional[datetime] = None
    reported_by_name: Optional[str] = None
    assist_pathologist_id: Optional[int] = None
    assist_pathologist_name: Optional[str] = None
    is_cancelled: bool
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Standalone-only registration/demographic fields (null for parent-linked cases).
    patient_id: Optional[int] = None
    patient: Optional[MolecularPatientRef] = None
    hospital_id: Optional[int] = None
    department_id: Optional[int] = None
    medical_scheme_id: Optional[int] = None
    an: Optional[str] = None
    vn: Optional[str] = None
    clinical_diagnosis: Optional[str] = None
    clinician_name: Optional[str] = None
    collect_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
