# app/models/system_setting.py
from sqlalchemy import Column, Float, Integer, String, Text, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    hospital_slug = Column(String, unique=True, index=True, default="master")

    # --- Hospital Identity ---
    lab_name_th = Column(String, default="ชื่อห้องปฏิบัติการ")  # 🚩 แยกไทย-อังกฤษ
    lab_name_en = Column(String, default="Laboratory Name")
    # 🚩 เพิ่มชื่อย่อภาษาอังกฤษ (เช่น "PATH-LAB", "MLT")
    lab_short_name_en = Column(String, nullable=True)
    lab_address = Column(Text, nullable=True)
    report_logo_url = Column(String, nullable=True)  # สำหรับหัวรายงาน
    login_logo_url = Column(String, nullable=True)  # 🚩 สำหรับหน้า Login
    login_announcement = Column(Text, nullable=True)  # ข้อความแจ้งข่าวบนหน้า Login

    # --- Turnaround Time (SLA) Settings (Days) ---
    # เคสปกติ (Routine)
    surgical_tat_days = Column(Integer, default=10, server_default="10")
    non_gyne_tat_days = Column(Integer, default=5, server_default="5")
    gyne_tat_days = Column(Integer, default=5, server_default="5")
    # 🚩 เคสด่วน (Express/Urgent) - เพิ่มใหม่
    surgical_express_tat_days = Column(Integer, default=3)  # ปกติด่วนมักจะ 1-2 วัน
    non_gyne_express_tat_days = Column(Integer, default=3)
    gyne_express_tat_days = Column(Integer, default=3)

    # --- Report Settings ---
    is_cumulative_report = Column(Boolean, default=True)
    # 🚩 เพิ่มฟิลด์ควบคุมการแสดงชื่อชิ้นเนื้อ (A: Appendix vs A:)
    show_specimen_name = Column(Boolean, default=True)
    # 🚩 เพิ่มฟิลด์สำหรับจัดการ Footer หรือ ลายน้ำ (Watermark)
    report_footer_text = Column(Text, nullable=True)
    surgical_report_footer = Column(Text, nullable=True)
    gyne_report_footer = Column(Text, nullable=True)
    nongyne_report_footer = Column(Text, nullable=True)

    # --- Report Template Selection ---
    surgical_report_template = Column(String, nullable=True)   # filename inside templates/reports/
    gyne_report_template = Column(String, nullable=True)
    nongyne_report_template = Column(String, nullable=True)

    # --- Report Color Scheme ---
    report_primary_color = Column(String, nullable=True)  # hex e.g. "#0056b3"

    # --- Session / Security ---
    idle_timeout_minutes = Column(Integer, default=10, nullable=False)
    idle_warning_minutes = Column(Integer, default=1, nullable=False)

    # --- Password Policy ---
    password_min_length = Column(Integer, default=8, nullable=False)
    password_expiry_days = Column(Integer, default=0, nullable=False)  # 0 = no expiry

    # --- Workflow Control ---
    enable_approve_system = Column(Boolean, default=False) # Surgical (Legacy name)
    enable_gyne_qc_system = Column(Boolean, default=False) # Gyne — controls NILM random sampling
    enable_non_gyne_approve_system = Column(Boolean, default=False) # Non-Gyne
    # 🚩 กำหนดว่าต้องเซ็นครบทุกคนก่อนส่ง Approve หรือไม่
    # 🚩 กำหนดว่าต้องเซ็นครบทุกคนก่อนส่ง Approve หรือไม่
    require_all_pathologists_sign = Column(Boolean, default=False) # Surgical (Legacy name)
    require_all_gyne_sign = Column(Boolean, default=False) # Gyne (Pathologist + Cytotechnologist)
    require_all_non_gyne_sign = Column(Boolean, default=False) # Non-Gyne
    nongyne_slide_dispatch_enabled = Column(Boolean, default=True, nullable=False, server_default="true")
    # On: block must pass Tissue Processing -> Embedding -> Sectioning before staining.
    # Off: block is stainable immediately after grossing; those 3 menu items are hidden.
    enable_tissue_processing_workflow = Column(Boolean, default=True, nullable=False, server_default="true")
    # 10% QC review: review every N-th NILM case per cytotechnologist (0 = disabled)
    nilm_review_every_n = Column(Integer, default=10)
    # 🚩 ตั้งค่าการรันเลข Case (เช่น S26-00001)
    accession_no_format = Column(String, default="{year}-{no}")
    surgical_accession_prefix = Column(String, default="S", nullable=False)
    gyne_accession_prefix = Column(String, default="C", nullable=False)
    nongyne_accession_prefix = Column(String, default="N", nullable=False)

    # --- Barcode Settings ---
    barcode_opd_prefix = Column(String, default="2")
    barcode_ipd_prefix = Column(String, default="3")
    barcode_surgical_type_code = Column(String, default="08")
    barcode_gyne_type_code = Column(String, default="09")
    barcode_nongyne_type_code = Column(String, default="10")

    # --- Sticker / Label Print Settings ---
    sticker_width_cm = Column(Float, default=2.0, nullable=False)
    sticker_height_cm = Column(Float, default=2.0, nullable=False)
    sticker_orientation = Column(String, default="portrait", nullable=False)
    sticker_font_accession = Column(Integer, default=7, nullable=False)
    sticker_font_block = Column(Integer, default=7, nullable=False)
    sticker_font_stain = Column(Integer, default=6, nullable=False)
    sticker_font_hospital = Column(Integer, default=6, nullable=False)
    sticker_font_date = Column(Integer, default=6, nullable=False)
    sticker_margin_top_cm = Column(Float, default=0.0, nullable=False)
    sticker_qr_scale = Column(Float, default=1.0, nullable=False)
    sticker_qr_offset_x_cm = Column(Float, default=0.0, nullable=False)
    sticker_qr_offset_y_cm = Column(Float, default=0.0, nullable=False)

    # --- Advanced Settings ---
    # 🚩 ใช้ JSON สำหรับเก็บค่าตั้งค่าเล็กๆ น้อยๆ ที่อาจจะเพิ่มในอนาคตโดยไม่ต้องแก้ DB Schema
    config_options = Column(JSON, nullable=True)

    # --- AI / Tumor Registry ---
    tumor_registry_enabled = Column(Boolean, default=False, nullable=False)
    tumor_registry_llm_profile_id = Column(Integer, ForeignKey("llm_profiles.id"), nullable=True)
    tumor_registry_system_prompt = Column(Text, nullable=True)
    show_icd_o_in_report = Column(Boolean, default=False, nullable=False)
    report_gen_llm_profile_id = Column(Integer, ForeignKey("llm_profiles.id"), nullable=True)
    report_gen_system_prompt = Column(Text, nullable=True)

    # --- AI / Grossing Assistant ---
    grossing_assist_enabled = Column(Boolean, default=False, nullable=False)
    grossing_assist_llm_profile_id = Column(Integer, ForeignKey("llm_profiles.id"), nullable=True)
    grossing_assist_system_prompt = Column(Text, nullable=True)

    # --- Default Test Selection ---
    # --- Default Test Selection ---
    # 🚩 ต้องใส่ ForeignKey("ชื่อตารางใน_db.id") ลงไปในคอลัมน์ ID ด้วย
    default_gyne_test_id = Column(
        Integer, ForeignKey("anatomical_pathology_tests.id"), nullable=True
    )
    default_non_gyne_test_id = Column(
        Integer, ForeignKey("anatomical_pathology_tests.id"), nullable=True
    )
    default_surgical_test_id = Column(
        Integer, ForeignKey("anatomical_pathology_tests.id"), nullable=True
    )

    # 🚩 สร้าง Relationship ให้ครบทั้ง 3 สาย และระบุ foreign_keys ให้ชัดเจน
    default_surgical_test = relationship(
        "AnatomicalPathologyTest", foreign_keys=[default_surgical_test_id]
    )
    default_gyne_test = relationship(
        "AnatomicalPathologyTest", foreign_keys=[default_gyne_test_id]
    )
    default_non_gyne_test = relationship(
        "AnatomicalPathologyTest", foreign_keys=[default_non_gyne_test_id]
    )
