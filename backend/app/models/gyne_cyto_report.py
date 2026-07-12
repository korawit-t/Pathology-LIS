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


class GyneReportStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending"
    PUBLISHED = "published"
    CANCELLED = "cancelled"


class GyneReportType(str, enum.Enum):
    FINAL = "Final"
    ADDENDUM = "Addendum"
    CORRECTED = "Corrected"
    REVISED = "Revised"


class GyneCytoReport(Base):
    __tablename__ = "gyne_cyto_reports"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("gyne_cytology_cases.id"), nullable=True)

    # --- ข้อมูลที่เป็น Snapshot (Immutable Data) ---
    accession_no = Column(String, index=True)
    patient_title = Column(String, nullable=True)
    patient_name = Column(String, index=True)
    patient_ln = Column(String, nullable=True)
    patient_hn = Column(String, index=True)
    patient_cid = Column(String, index=True)
    patient_birth_date = Column(DateTime, nullable=True)
    patient_age = Column(Integer)
    patient_gender = Column(String)

    # --- แหล่งที่มาและผู้ส่ง (Snapshot) ---
    hospital_name = Column(String, nullable=True)
    hospital_id = Column(Integer, index=True, nullable=True)
    department_name = Column(String, nullable=True)
    clinician_name = Column(String, nullable=True)

    # --- ผลวินิจฉัย (Snapshot) ---
    # เราก๊อปลงมาเป็น Text เพื่อความชัวร์ว่าถึง Master Data จะถูกลบ/แก้ รายงานใบเดิมก็ยังเหมือนเดิม
    adequacy_text = Column(String, nullable=True)
    endocervical_status_text = Column(String, nullable=True)
    quality_text = Column(String, nullable=True)
    category_1_text = Column(String, nullable=True)
    category_2_text = Column(String, nullable=True)
    
    interpretation = Column(Text, nullable=True)
    note = Column(Text, nullable=True)

    # --- Metadata & Responsibility ---
    report_type = Column(Enum(GyneReportType, values_callable=lambda x: [e.value for e in x]), default=GyneReportType.FINAL, nullable=False)
    pathologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pathologist_name = Column(String, nullable=True) # Snapshot ชื่อพยาธิแพทย์
    
    cytotechnologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cytotechnologist_name = Column(String, nullable=True) # Snapshot ชื่อนักเซลล์วิทยา
    
    signers_snapshot = Column(JSON, nullable=True) # เก็บ JSON List ของผู้เซ็นทั้งหมดเผื่อไว้

    # --- Footer & Identity Snapshots ---
    lab_name_snapshot = Column(String, nullable=True)
    lab_address_snapshot = Column(Text, nullable=True)

    # --- Status & Timestamps ---
    status = Column(Enum(GyneReportStatus, values_callable=lambda x: [e.value for e in x]), default=GyneReportStatus.DRAFT, nullable=False)
    version_no = Column(Integer, default=1, nullable=False)
    
    is_print = Column(Boolean, default=False, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime, nullable=True)

    reported_at = Column(DateTime, nullable=True, index=True)
    approved_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    case = relationship("GyneCytologyCase")
    pathologist = relationship("User", foreign_keys=[pathologist_id])
    
    signers = relationship(
        "GyneReportSigner", back_populates="report", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<GyneCytoReport(id={self.id}, case_id={self.case_id}, status='{self.status}')>"


class GyneReportSigner(Base):
    """
    เก็บข้อมูลแพทย์ผู้ลงนามในรายงาน Gyne Cytology (Primary, Co-signer)
    """
    __tablename__ = "gyne_report_signers"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("gyne_cyto_reports.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    role = Column(String, default="primary")  # primary, co-signer

    consult_note = Column(Text, nullable=True)   # คำถาม/บริบทจาก primary ถึง co-signer
    agreement = Column(String, nullable=True)     # 'agree' | 'disagree'
    agreement_note = Column(Text, nullable=True)

    assigned_at = Column(DateTime, default=datetime.now)
    signed_at = Column(DateTime, nullable=True)

    report = relationship("GyneCytoReport", back_populates="signers")
    user = relationship("User")

    def __repr__(self):
        return f"<GyneReportSigner(report_id={self.report_id}, user_id={self.user_id}, role='{self.role}')>"
