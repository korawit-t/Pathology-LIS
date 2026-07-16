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


class NongyneReportStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending"
    PUBLISHED = "published"
    CANCELLED = "cancelled"


class NongyneReportType(str, enum.Enum):
    FINAL = "Final"
    ADDENDUM = "Addendum"
    CORRECTED = "Corrected"
    REVISED = "Revised"


class NongyneCytoReport(Base):
    __tablename__ = "nongyne_cyto_reports"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("nongyne_cytology_cases.id"), nullable=True)

    # --- Patient Snapshot ---
    accession_no = Column(String, index=True)
    patient_title = Column(String, nullable=True)
    patient_name = Column(String, index=True)
    patient_ln = Column(String, nullable=True)
    patient_hn = Column(String, index=True)
    patient_cid = Column(String, index=True)
    patient_birth_date = Column(DateTime, nullable=True)
    patient_age = Column(Integer, nullable=True)
    patient_gender = Column(String, nullable=True)

    # --- Clinical Context Snapshot ---
    hospital_name = Column(String, nullable=True)
    hospital_id = Column(Integer, index=True, nullable=True)
    department_name = Column(String, nullable=True)
    clinician_name = Column(String, nullable=True)
    clinical_history_snapshot = Column(Text, nullable=True)
    clinical_diagnosis_snapshot = Column(Text, nullable=True)

    # --- Specimen Info Snapshot ---
    specimen_type = Column(String, nullable=True)
    collection_site = Column(String, nullable=True)

    # --- Diagnostic Content Snapshot (from NongyneDiagnosis) ---
    gross_description = Column(Text, nullable=True)
    microscopic_description = Column(Text, nullable=True)
    diagnosis = Column(Text, nullable=True)
    comment = Column(Text, nullable=True)

    # --- Diagnostic Flags ---
    has_malignancy = Column(Boolean, default=False, nullable=False, index=True)
    has_critical = Column(Boolean, default=False, nullable=False, index=True)

    # --- Metadata & Responsibility ---
    report_type = Column(Enum(NongyneReportType, values_callable=lambda x: [e.value for e in x]), default=NongyneReportType.FINAL, nullable=False)
    pathologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pathologist_name = Column(String, nullable=True)

    cytotechnologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cytotechnologist_name = Column(String, nullable=True)

    signers_snapshot = Column(JSON, nullable=True)

    # --- Footer & Identity Snapshots ---
    lab_name_snapshot = Column(String, nullable=True)
    lab_address_snapshot = Column(Text, nullable=True)

    # --- Status & Timestamps ---
    status = Column(Enum(NongyneReportStatus, values_callable=lambda x: [e.value for e in x]), default=NongyneReportStatus.DRAFT, nullable=False)
    version_no = Column(Integer, default=1, nullable=False)

    is_pending = Column(Boolean, default=False, nullable=False)
    pending_reason = Column(Text, nullable=True)

    is_print = Column(Boolean, default=False, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime, nullable=True)

    reported_at = Column(DateTime, nullable=True, index=True)
    approved_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # --- Relationships ---
    case = relationship("NongyneCytologyCase", back_populates="reports")
    pathologist = relationship("User", foreign_keys=[pathologist_id])

    signers = relationship(
        "NongyneReportSigner", back_populates="report", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<NongyneCytoReport(id={self.id}, case_id={self.case_id}, status='{self.status}')>"


class NongyneReportSigner(Base):
    __tablename__ = "nongyne_report_signers"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("nongyne_cyto_reports.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    role = Column(String, default="primary")

    consult_note = Column(Text, nullable=True)   # คำถาม/บริบทจาก primary ถึง co-signer
    agreement = Column(String, nullable=True)     # 'agree' | 'disagree'
    agreement_note = Column(Text, nullable=True)

    assigned_at = Column(DateTime, default=datetime.now)
    signed_at = Column(DateTime, nullable=True)

    report = relationship("NongyneCytoReport", back_populates="signers")
    user = relationship("User")

    def __repr__(self):
        return f"<NongyneReportSigner(report_id={self.report_id}, user_id={self.user_id}, role='{self.role}')>"
