import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Text,
    func,
    Enum,
    Boolean,
    JSON,
)
from sqlalchemy.orm import relationship
from app.db.database import Base
from datetime import datetime


# 1. กำหนด Enum คลาส
class ReportStatus(str, enum.Enum):
    DRAFT = "draft"  # พยาธิแพทย์กำลังร่างผล (ยังเซ็นไม่เสร็จ หรือรอแก้)
    PENDING_APPROVAL = "pending"  # เซ็นชื่อแล้ว แต่รอหัวหน้าแผนกหรือ Senior ตรวจทานก่อน Public
    PUBLISHED = "published"  # อนุมัติแล้ว Snapshot ถูกสร้างและแสดงผลในระบบ Public
    CANCELLED = "cancelled"  # รายงานถูกยกเลิก (Void)


class ReportType(str, enum.Enum):
    FINAL = "Final"
    ADDENDUM = "Addendum"
    CORRECTED = "Corrected"
    REVISED = "Revised"


class SurgicalReport(Base):
    __tablename__ = "surgical_reports"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("surgical_cases.id"), nullable=True)

    # --- ข้อมูลที่เป็น Snapshot (Immutable Data) ---
    # เก็บข้อมูล ณ เวลาที่ออกผล เพื่อใช้เป็นหลักฐานทางกฎหมายแม้ข้อมูลต้นทางจะถูกแก้
    accession_no = Column(String, index=True)  # เลขเบอร์เคส (S26-xxxx)
    patient_title = Column(String, nullable=True)  # คำนำหน้า
    patient_name = Column(String, index=True)  # 🚩 เพิ่ม Index สำหรับค้นหาด้วยชื่อ
    patient_ln = Column(String, index=True)
    patient_hn = Column(String, index=True)  # Index สำคัญที่สุดสำหรับการค้นหาย้อนหลัง
    patient_cid = Column(String, index=True)  # เลขบัตรประชาชน
    patient_birth_date = Column(DateTime, nullable=True)
    patient_age = Column(Integer)
    patient_age_display = Column(String, nullable=True)
    patient_gender = Column(String)

    # --- ข้อมูลการรับสิ่งส่งตรวจ (Snapshot) ---
    collect_at = Column(DateTime, nullable=True)  # วันที่เก็บสิ่งส่งตรวจ
    registered_at = Column(DateTime, nullable=True)  # วันที่ลงทะเบียนรับเคส (regis

    # --- แหล่งที่มาและผู้ส่ง (Snapshot) ---
    hospital_name = Column(String, nullable=True)  # โรงพยาบาลต้นทาง
    hospital_id = Column(Integer, index=True, nullable=False)  # รหัสโรงพยาบาลต้นทาง
    department_name = Column(String, nullable=True)  # แผนกที่ส่ง (department/dep)
    clinician_name = Column(String, nullable=True)  # แพทย์เจ้าของไข้

    # --- 🚩 Diagnostic Flags (Snapshot) ---
    has_malignancy = Column(Boolean, default=False, nullable=False, index=True)
    has_critical = Column(Boolean, default=False, nullable=False)
    is_pending = Column(Boolean, default=False, nullable=False)
    pending_reason = Column(Text, nullable=True)
    """
    ฟิลด์เหล่านี้ก๊อปปี้มาจาก SurgicalCase ณ เวลาที่สร้าง Report
    - has_malignancy: เพื่อโชว์ตราปั๊มเนื้อร้ายในใบรายงาน
    - has_critical: เพื่อเก็บประวัติว่าเคสนี้เคยเป็น Critical Value
    - is_pending/pending_reason: กรณีออกรายงานเบื้องต้น (Preliminary) แต่ยังค้างผลบางส่วน
    """

    clinical_history_snapshot = Column(
        Text, nullable=True
    )  # ประวัติการวินิจฉัยทางคลินิกจากแพทย์เจ้าของไข้

    specimen_summary = Column(Text, nullable=True)  # รายการชิ้นเนื้อทั้งหมด (Label: Name)
    gross_description_summary = Column(
        Text, nullable=True
    )  # รายละเอียดการตรวจด้วยตาเปล่า (รวมทุกชิ้น)
    submitted_sections_snapshot = Column(
        JSON, nullable=True
    )  # block data snapshot: [{specimen_label, specimen_name, is_entirely_submitted, blocks:[{block_no,tissue_count,...}]}]
    diagnosis_summary = Column(Text, nullable=True)  # ผลการวินิจฉัยทางพยาธิวิทยา (รวมทุกชิ้น)
    microscopic_summary = Column(Text, nullable=True)
    comment_summary = Column(Text, nullable=True)  # ความเห็นเพิ่มเติมหรือข้อแนะนำ

    # --- ผู้ลงนาม (Snapshot) ---

    # --- Metadata & Responsibility ---
    report_type = Column(
        Enum("Final", "Addendum", "Corrected", "Revised", name="reporttype"),
        default="Final",
        nullable=False,
    )
    pathologist_name = Column(
        String, nullable=True
    )  # เก็บชื่อพยาธิแพทย์เป็น String (Snapshot)

    # --- Footer & Identity Snapshots (Immutable) ---
    # เก็บไว้เพื่อให้เวลา Re-print รายงานฉบับย้อนหลัง ข้อมูลหัว/ท้ายกระดาษยังคงเดิม
    lab_name_th_snapshot = Column(String, nullable=True)
    lab_name_en_snapshot = Column(String, nullable=True)
    lab_address_snapshot = Column(Text, nullable=True)
    report_footer_snapshot = Column(Text, nullable=True)
    consult_pdf_path_snapshot = Column(String, nullable=True)
    consult_pdf_thumbnail_snapshot = Column(Text, nullable=True)
    consult_pdf_approved_by_snapshot = Column(String, nullable=True)
    consult_pdf_approved_at_snapshot = Column(DateTime, nullable=True)

    # --- Status & Timestamps ---
    status = Column(
        Enum("draft", "pending", "published", "cancelled", name="reportstatus"),
        default="draft",
        nullable=False,
    )
    approved_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)  # วันที่ออกรายงานฉบับสมบูรณ์
    is_print = Column(Boolean, default=False, nullable=False)  # สถานะว่าพิมพ์ PDF หรือยัง
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime, nullable=True)
    reported_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    version_no = Column(Integer, default=1, nullable=False)

    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approver_name_snapshot = Column(String, nullable=True)

    # --- Relationships ---
    case = relationship("SurgicalCase", back_populates="reports")

    signers = relationship(
        "ReportSigner", back_populates="report", cascade="all, delete-orphan"
    )

    microscopic_images = relationship(
        "SurgicalReportImage", back_populates="report", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<SurgicalReport(id={self.id}, case_id={self.case_id}, status='{self.status}')>"


class SurgicalReportImage(Base):
    __tablename__ = "surgical_report_images"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(
        Integer, ForeignKey("surgical_reports.id", ondelete="CASCADE"), nullable=False
    )

    # ข้อมูลรูปที่ก๊อปปี้มา (Copy only metadata/paths)
    image_url = Column(String, nullable=False)
    magnification = Column(String, nullable=True)
    stain = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    # Relationship กลับไปหาตัวพ่อ
    report = relationship("SurgicalReport", back_populates="microscopic_images")

    def __repr__(self):
        return f"<SurgicalReportImage(id={self.id}, report_id={self.report_id})>"


class ReportApprovalLog(Base):
    __tablename__ = "report_approval_logs"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(
        Integer, ForeignKey("surgical_reports.id", ondelete="CASCADE"), nullable=False
    )

    # ใครเป็นคนดำเนินการ
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approver_name = Column(String)  # Snapshot ชื่อผู้อนุมัติไว้ด้วย

    # การตัดสินใจ
    action = Column(String)  # e.g., "APPROVED", "REJECTED", "REQUEST_CHANGES"
    comment = Column(Text, nullable=True)  # หมายเหตุ หรือเหตุผลถ้าไม่ให้ผ่าน

    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    report = relationship("SurgicalReport", backref="approval_logs")
    approver = relationship("User")


class ReportAccessLog(Base):
    """เก็บประวัติว่าใคร (Clinician/Staff) เข้ามาเปิดดู PDF หรือดึงข้อมูลรายงานฉบับนี้"""

    __tablename__ = "report_access_logs"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("surgical_reports.id"))
    user_id = Column(Integer, ForeignKey("users.id"))

    # บันทึก IP Address หรือช่องทางที่เข้าถึง (Browser/Mobile)
    ip_address = Column(String, nullable=True)
    accessed_at = Column(DateTime, server_default=func.now())


class ReportSigner(Base):
    """ตารางเดียวจบ: เก็บทั้งคนที่มีหน้าที่รับผิดชอบ และหลักฐานการเซ็น"""

    __tablename__ = "report_signers"

    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("surgical_reports.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id"))

    # 🚩 [KEY] ตัวแบ่งรอบ: 1=Original, 2=Addendum 1, 3=Addendum 2, ...
    # ต้องสัมพันธ์กับ diagnosis_order ในตาราง SurgicalDiagnosis
    diagnosis_order = Column(Integer, default=1, nullable=False)

    role = Column(String, default="primary")  # primary, co-signer, resident, consultant

    # Co-sign / consult fields
    consult_note = Column(Text, nullable=True)   # คำถาม/บริบทจาก primary ถึง co-signer
    agreement = Column(String, nullable=True)     # 'agree' | 'disagree'
    agreement_note = Column(Text, nullable=True) # เหตุผลที่ไม่เห็นด้วย

    # 🚩 ตัวชี้วัดสถานะ
    assigned_at = Column(DateTime, default=datetime.now)
    signed_at = Column(DateTime, nullable=True)  # NULL = ยังไม่เซ็น

    report = relationship("SurgicalReport", back_populates="signers")
    user = relationship("User")
