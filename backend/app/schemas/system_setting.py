from pydantic import ConfigDict, BaseModel, model_validator
from typing import Optional, Any, Dict


class TestSimpleResponse(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class SystemSettingBase(BaseModel):
    hospital_slug: Optional[str] = "master"
    lab_name_th: Optional[str] = "ชื่อห้องปฏิบัติการ"
    lab_name_en: Optional[str] = "Laboratory Name"
    lab_short_name_en: Optional[str] = "LAB-SHORT"
    lab_address: Optional[str] = None
    report_logo_url: Optional[str] = None
    login_logo_url: Optional[str] = None
    login_announcement: Optional[str] = None

    # --- Report Settings ---
    is_cumulative_report: bool = True
    show_specimen_name: bool = True  # 🚩 เพิ่มฟิลด์นี้
    report_footer_text: Optional[str] = None
    surgical_report_footer: Optional[str] = None
    gyne_report_footer: Optional[str] = None
    nongyne_report_footer: Optional[str] = None

    # --- Session / Security ---
    idle_timeout_minutes: Optional[int] = 10
    idle_warning_minutes: Optional[int] = 1
    password_min_length: Optional[int] = 8
    password_expiry_days: Optional[int] = 0

    # --- Workflow ---
    # SystemSettingBase
    enable_approve_system: bool = False
    enable_gyne_qc_system: bool = False
    enable_non_gyne_approve_system: bool = False
    nongyne_slide_dispatch_enabled: bool = True
    enable_tissue_processing_workflow: bool = True
    nilm_review_every_n: Optional[int] = 10
    require_all_pathologists_sign: Optional[bool] = None
    require_all_gyne_sign: Optional[bool] = None
    require_all_non_gyne_sign: Optional[bool] = None
    accession_no_format: str = "{year}-{no}"
    surgical_accession_prefix: str = "S"
    gyne_accession_prefix: str = "C"
    nongyne_accession_prefix: str = "N"

    # SLA Routine
    surgical_tat_days: Optional[int] = None
    non_gyne_tat_days: Optional[int] = None
    gyne_tat_days: Optional[int] = None

    # 🚩 SLA Express
    surgical_express_tat_days: Optional[int] = None
    non_gyne_express_tat_days: Optional[int] = None
    gyne_express_tat_days: Optional[int] = None

    config_options: Optional[Dict[str, Any]] = None

    # --- Sticker / Label Print Settings ---
    sticker_width_cm: Optional[float] = 2.0
    sticker_height_cm: Optional[float] = 2.0
    sticker_orientation: Optional[str] = "portrait"
    sticker_font_accession: Optional[int] = 7
    sticker_font_block: Optional[int] = 7
    sticker_font_stain: Optional[int] = 6
    sticker_font_hospital: Optional[int] = 6
    sticker_font_date: Optional[int] = 6
    sticker_margin_top_cm: Optional[float] = 0.0
    sticker_qr_scale: Optional[float] = 1.0
    sticker_qr_offset_x_cm: Optional[float] = 0.0
    sticker_qr_offset_y_cm: Optional[float] = 0.0

    # --- Report Template Selection ---
    surgical_report_template: Optional[str] = None
    gyne_report_template: Optional[str] = None
    nongyne_report_template: Optional[str] = None

    # --- Report Color Scheme ---
    report_primary_color: Optional[str] = None

    # 🚩 เพิ่มฟิลด์ Default Test IDs เพื่อเชื่อมกับ Master Data
    default_gyne_test_id: Optional[int] = None
    default_non_gyne_test_id: Optional[int] = None
    default_surgical_test_id: Optional[int] = None

    # --- AI / Tumor Registry ---
    tumor_registry_enabled: bool = False
    tumor_registry_llm_profile_id: Optional[int] = None
    tumor_registry_system_prompt: Optional[str] = None
    show_icd_o_in_report: bool = False
    report_gen_llm_profile_id: Optional[int] = None
    report_gen_system_prompt: Optional[str] = None

    # --- AI / Grossing Assistant ---
    grossing_assist_enabled: bool = False
    grossing_assist_llm_profile_id: Optional[int] = None
    grossing_assist_system_prompt: Optional[str] = None


class SystemSettingUpdate(SystemSettingBase):
    # ให้ทุกอย่างเป็น Optional เพื่อการทำ PATCH update ที่สมบูรณ์
    lab_name_th: Optional[str] = None
    lab_name_en: Optional[str] = None
    lab_short_name_en: Optional[str] = None  # 🚩
    is_cumulative_report: Optional[bool] = None
    show_specimen_name: Optional[bool] = None
    require_all_pathologists_sign: Optional[bool] = None
    require_all_gyne_sign: Optional[bool] = None
    require_all_non_gyne_sign: Optional[bool] = None
    enable_approve_system: Optional[bool] = None
    enable_gyne_qc_system: Optional[bool] = None
    enable_non_gyne_approve_system: Optional[bool] = None
    nongyne_slide_dispatch_enabled: Optional[bool] = None
    enable_tissue_processing_workflow: Optional[bool] = None
    nilm_review_every_n: Optional[int] = None
    surgical_tat_days: Optional[int] = None
    non_gyne_tat_days: Optional[int] = None
    gyne_tat_days: Optional[int] = None
    accession_no_format: Optional[str] = None
    idle_timeout_minutes: Optional[int] = None
    idle_warning_minutes: Optional[int] = None

    # SLA Routine
    surgical_tat_days: Optional[int] = None
    non_gyne_tat_days: Optional[int] = None
    gyne_tat_days: Optional[int] = None

    # 🚩 SLA Express
    surgical_express_tat_days: Optional[int] = None
    non_gyne_express_tat_days: Optional[int] = None
    gyne_express_tat_days: Optional[int] = None

    # 🚩 เพิ่มส่วน Default IDs ใน Update Schema
    default_gyne_test_id: Optional[int] = None
    default_non_gyne_test_id: Optional[int] = None
    default_surgical_test_id: Optional[int] = None

    sticker_width_cm: Optional[float] = None
    sticker_height_cm: Optional[float] = None
    sticker_orientation: Optional[str] = None
    sticker_font_accession: Optional[int] = None
    sticker_font_block: Optional[int] = None
    sticker_font_stain: Optional[int] = None
    sticker_font_hospital: Optional[int] = None
    sticker_font_date: Optional[int] = None
    sticker_margin_top_cm: Optional[float] = None
    sticker_qr_scale: Optional[float] = None
    sticker_qr_offset_x_cm: Optional[float] = None
    sticker_qr_offset_y_cm: Optional[float] = None


class SystemSettingResponse(SystemSettingBase):
    id: int
    default_surgical_test_id: Optional[int]

    # 🚩 ต้องมีฟิลด์นี้! เพื่อให้ Pydantic ยอมรับข้อมูลที่ joinedload มาจาก SQL
    # ชื่อฟิลด์ต้องตรงกับ relationship ใน Model (น่าจะชื่อ default_surgical_test)
    default_surgical_test: Optional[TestSimpleResponse] = None

    # ฟิลด์ที่จะส่งไปให้ Frontend
    default_surgical_test_name: Optional[str] = None

    @model_validator(mode="after")
    def get_test_name(self):
        # ตอนนี้ self.default_surgical_test จะมีข้อมูลแล้ว (ไม่เป็น None)
        if self.default_surgical_test:
            self.default_surgical_test_name = self.default_surgical_test.name
        return self

    model_config = ConfigDict(from_attributes=True)
