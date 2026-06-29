# app/schemas/surgical_bulk.py
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime


class DiagnosisEntry(BaseModel):
    id: Optional[int] = None  # specimen_id
    diagnosis: Optional[str] = None
    microscopic_description: Optional[str] = None
    is_active: bool = True


class BulkSaveDraft(BaseModel):
    case_id: int
    diagnosis_mode: str  # "individual" | "integrated" | "clean"

    # --- ส่วนที่ 1: ข้อมูลที่จะไป SurgicalCase ---
    clinical_diagnosis: Optional[str] = None
    has_malignancy: bool = False
    has_critical: bool = False
    is_pending: bool = False
    pending_reason: Optional[str] = None
    is_out_lab_consult: Optional[bool] = None
    consult_reason: Optional[str] = None
    consult_report_out_at: Optional[datetime] = None

    # --- Quality Assessment ---
    stain_quality: Optional[str] = None
    tissue_quality: Optional[str] = None
    slide_quality: Optional[str] = None

    # --- ส่วนที่ 2: ข้อมูลที่จะไป SurgicalSpecimen ---
    # 🚩 ห้ามเอาออก! เพราะหมอพิมพ์ Gross ที่หน้า Report แล้วกด Save Bulk
    # Backend จะได้เอา Dict นี้ไปวนลูปอัปเดตตาราง specimen ได้
    gross_descriptions: Dict[int, str]  # { specimen_id: gross_text }

    # --- ส่วนที่ 3: ข้อมูลที่จะไป SurgicalDiagnosis ---
    case_diagnosis_text: Optional[str] = None  # สำหรับ CASE level
    diagnoses: Dict[int, DiagnosisEntry]  # สำหรับ SPECIMEN level

    pathologists: List[dict]
    signed_by_id: Optional[int] = None
