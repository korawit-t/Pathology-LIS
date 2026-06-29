from pydantic import ConfigDict, BaseModel
from datetime import datetime, date
from typing import Optional, List


# Schema พื้นฐานสำหรับข้อมูล Snapshot
class SurgicalReportBase(BaseModel):
    case_id: Optional[int] = None
    version_no: int = 1
    report_type: str = "Final"
    status: str = "draft"

    # --- Patient Identifiers (Snapshot) ---
    accession_no: Optional[str] = None
    patient_title: Optional[str] = None
    patient_name: Optional[str] = None
    patient_ln: Optional[str] = None
    patient_hn: Optional[str] = None
    patient_cid: Optional[str] = None
    patient_birth_date: Optional[date] = None
    patient_age: Optional[int] = None
    patient_age_display: Optional[str] = None
    patient_gender: Optional[str] = None

    # --- Clinical Context ---
    hospital_name: Optional[str] = None
    department_name: Optional[str] = None
    clinician_name: Optional[str] = None
    clinical_history_snapshot: Optional[str] = None

    # --- Medical Content ---
    specimen_summary: Optional[str] = None
    gross_description_summary: Optional[str] = None
    diagnosis_summary: Optional[str] = None
    microscopic_summary: Optional[str] = None
    comment_summary: Optional[str] = None
    pathologist_name: Optional[str] = None

    # --- 🚩 เพิ่ม Identity & Footer Snapshots (เพื่อให้ Response มีข้อมูลหัว/ท้ายรายงาน) ---
    lab_name_th_snapshot: Optional[str] = None
    lab_name_en_snapshot: Optional[str] = None
    lab_address_snapshot: Optional[str] = None
    report_footer_snapshot: Optional[str] = None

    # --- Timestamps ---
    collect_at: Optional[datetime] = None
    registered_at: Optional[datetime] = None
    reported_at: Optional[datetime] = None  # 🚩 เพิ่มวันที่พยาธิแพทย์ส่งข้อมูล


class SurgicalReportCreate(SurgicalReportBase):
    # ใช้รับข้อมูลจาก prepare_report_data เพื่อ Insert ลง DB
    pass


class MicroscopicImageSnapshotSchema(BaseModel):
    id: int
    image_url: str
    magnification: Optional[str] = None
    stain: Optional[str] = None
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ReportSignerCreate(BaseModel):
    user_id: int
    role: str = "co-signer"
    consult_note: Optional[str] = None


class ReportSignerResponse(BaseModel):
    user_id: Optional[int] = None
    role: str
    diagnosis_order: int = 1
    assigned_at: datetime
    signed_at: Optional[datetime] = None
    consult_note: Optional[str] = None
    agreement: Optional[str] = None
    agreement_note: Optional[str] = None
    user_full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SurgicalReportResponse(SurgicalReportBase):
    id: int
    published_at: Optional[datetime] = None  # วันที่ผลสมบูรณ์ (Public)
    is_print: bool = False
    approved_at: Optional[datetime] = None  # วันที่ได้รับการอนุมัติ (ถ้ามี)
    approved_by_id: Optional[int] = None
    approver_name_snapshot: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    signers: List[ReportSignerResponse] = []

    microscopic_images: List[MicroscopicImageSnapshotSchema] = []

    model_config = ConfigDict(from_attributes=True)


class SurgicalReportPagination(BaseModel):
    items: List[SurgicalReportResponse]
    total: int
    page: int
    size: int

    model_config = ConfigDict(from_attributes=True)


class DailyStat(BaseModel):
    date: str
    total_cases: int
    average_tt_hours: float

class TATDistribution(BaseModel):
    tt_days: str
    case_count: int

class SurgicalStatResponse(BaseModel):
    total_cases: int
    average_tt_days: float
    average_tt_hours: float
    daily_stats: List[DailyStat] = []
    tt_distribution: List[TATDistribution] = []
    complexity_breakdown: Optional[dict] = None


class LabTechStatResponse(BaseModel):
    grossed_cases: int = 0
    embedded_blocks: int = 0
    sectioned_blocks: int = 0
    stained_blocks: int = 0
    total_slides: int = 0
    dispatched_cases: int = 0
    outlab_sent_blocks: int = 0
    complexity_breakdown: Optional[dict] = None



