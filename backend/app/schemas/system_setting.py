from pydantic import ConfigDict, BaseModel
from typing import List, Optional


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
    cumulative_report_newest_first: bool = True
    show_specimen_name: bool = True  # 🚩 เพิ่มฟิลด์นี้
    report_footer_text: Optional[str] = None
    surgical_report_footer: Optional[str] = None
    gyne_report_footer: Optional[str] = None
    nongyne_report_footer: Optional[str] = None

    # --- Controlled-document numbers ---
    specimen_disposal_doc_no: Optional[str] = None

    # --- Session / Security ---
    idle_timeout_minutes: Optional[int] = 10
    idle_warning_minutes: Optional[int] = 1
    password_min_length: Optional[int] = 8
    password_expiry_days: Optional[int] = 0

    # --- Workflow ---
    # SystemSettingBase
    enable_approve_system: bool = False
    enable_gyne_qc_system: bool = False
    enable_cyto_path_qc: bool = False
    enable_non_gyne_approve_system: bool = False
    nongyne_slide_dispatch_enabled: bool = True
    enable_tissue_processing_workflow: bool = True
    nilm_review_every_n: Optional[int] = 10
    require_all_pathologists_sign: Optional[bool] = None
    require_all_gyne_sign: Optional[bool] = None
    require_all_non_gyne_sign: Optional[bool] = None
    surgical_accession_prefix: str = "S"
    gyne_accession_prefix: str = "C"
    nongyne_accession_prefix: str = "N"
    molecular_accession_prefix: str = "M"

    # SLA Routine
    surgical_tat_days: Optional[int] = None
    non_gyne_tat_days: Optional[int] = None
    gyne_tat_days: Optional[int] = None

    # 🚩 SLA Express
    surgical_express_tat_days: Optional[int] = None
    non_gyne_express_tat_days: Optional[int] = None
    gyne_express_tat_days: Optional[int] = None

    # --- Scheduled Notification Check Times ---
    scheduled_notification_times: Optional[List[str]] = None

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
    # --- Multi-Factor Authentication (write path; authenticated only) ---
    mfa_enabled: Optional[bool] = None
    mfa_required_roles: Optional[List[str]] = None
    mfa_grace_period_days: Optional[int] = None
    mfa_allowed_methods: Optional[List[str]] = None
    mfa_trusted_device_days: Optional[int] = None
    mfa_step_up_minutes: Optional[int] = None

    # ให้ทุกอย่างเป็น Optional เพื่อการทำ PATCH update ที่สมบูรณ์
    lab_name_th: Optional[str] = None
    lab_name_en: Optional[str] = None
    lab_short_name_en: Optional[str] = None  # 🚩
    is_cumulative_report: Optional[bool] = None
    show_specimen_name: Optional[bool] = None
    specimen_disposal_doc_no: Optional[str] = None
    specimen_retention_days: Optional[int] = None
    nongyne_specimen_disposal_doc_no: Optional[str] = None
    nongyne_specimen_retention_days: Optional[int] = None
    require_all_pathologists_sign: Optional[bool] = None
    require_all_gyne_sign: Optional[bool] = None
    require_all_non_gyne_sign: Optional[bool] = None
    enable_approve_system: Optional[bool] = None
    enable_gyne_qc_system: Optional[bool] = None
    enable_cyto_path_qc: Optional[bool] = None
    enable_non_gyne_approve_system: Optional[bool] = None
    nongyne_slide_dispatch_enabled: Optional[bool] = None
    enable_tissue_processing_workflow: Optional[bool] = None
    nilm_review_every_n: Optional[int] = None
    surgical_tat_days: Optional[int] = None
    non_gyne_tat_days: Optional[int] = None
    gyne_tat_days: Optional[int] = None
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

    # --- Barcode Label Format ---
    # Declared here rather than on SystemSettingBase because that shape is what
    # /system-settings/public returns to unauthenticated callers, and the codes
    # a site's HIS matches on are useless to a login screen.
    barcode_opd_prefix: Optional[str] = None
    barcode_ipd_prefix: Optional[str] = None
    barcode_surgical_type_code: Optional[str] = None
    barcode_gyne_type_code: Optional[str] = None
    barcode_nongyne_type_code: Optional[str] = None


class SystemSettingResponse(SystemSettingBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class SystemSettingAdminResponse(SystemSettingResponse):
    """Everything the settings screen needs, for authenticated callers only.

    Kept separate from SystemSettingResponse because that shape is also what
    /system-settings/public returns, and that endpoint needs no login at all.
    Which roles are exempt from MFA, and how long a device stays trusted, are
    useful to somebody probing the login page and useless to the login page
    itself.
    """

    mfa_enabled: Optional[bool] = None
    mfa_required_roles: Optional[List[str]] = None
    mfa_grace_period_days: Optional[int] = None
    mfa_allowed_methods: Optional[List[str]] = None
    mfa_trusted_device_days: Optional[int] = None
    mfa_step_up_minutes: Optional[int] = None

    # เกณฑ์/เลขคุมเอกสารการทำลายสิ่งส่งตรวจ — เป็น config ของแลป
    # หน้า login ไม่ได้ใช้ จึงไม่ต้องอยู่ใน shape ที่ /public คืนออกไป
    specimen_retention_days: Optional[int] = None
    nongyne_specimen_disposal_doc_no: Optional[str] = None
    nongyne_specimen_retention_days: Optional[int] = None

    # Read back by the Barcode Label Format settings screen. Without these the
    # form reloads empty after every save.
    barcode_opd_prefix: Optional[str] = None
    barcode_ipd_prefix: Optional[str] = None
    barcode_surgical_type_code: Optional[str] = None
    barcode_gyne_type_code: Optional[str] = None
    barcode_nongyne_type_code: Optional[str] = None
