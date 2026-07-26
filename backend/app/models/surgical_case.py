from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Text,
    Boolean,
    Index,
    func,
    Enum,
)
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.enums.quality_enum import QualityEnum


class SurgicalCase(Base):
    __tablename__ = "surgical_cases"

    # --- 1. Primary Key & Identification ---
    id = Column(Integer, primary_key=True, index=True)

    # เลขที่เคส (Unique)
    accession_no = Column(
        String, index=True, unique=True, nullable=False, comment="S25-00001"
    )
    # เลขที่แล็บ (อาจไม่ Unique ถ้าหนึ่งแล็บมีหลายเคส)
    lab_number = Column(
        String, index=True, nullable=True, comment="Lab Number from Hospital System"
    )

    # --- 2. Patient & Clinical Links ---
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    medical_scheme_id = Column(Integer, ForeignKey("medical_schemes.id"), nullable=True)

    hn = Column(String, index=True)
    an = Column(String, nullable=True)
    vn = Column(String, nullable=True)
    clinical_diagnosis = Column(Text, nullable=True)
    clinician_name = Column(String, nullable=True)
    is_express = Column(Boolean, default=False)
    is_frozen_section = Column(Boolean, default=False)
    collect_at = Column(DateTime, nullable=True, comment="วันที่และเวลาเก็บสิ่งส่งตรวจ")

    # --- 3. Management & Workflow ---
    pathologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="registered", index=True)
    diagnosis_mode = Column(
        String,
        default="individual",
        comment="โหมดการวินิจฉัย: 'individual' (แยกชิ้น), 'integrated' (รวมชิ้น), 'clean' (รวมชิ้นแบบไม่มี Micro)",
    )

    registrar_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    registered_at = Column(DateTime, default=func.now())

    gross_at = Column(DateTime, nullable=True)
    gross_examiner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    gross_assistant_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    report_at = Column(DateTime, nullable=True)

    # Flags สำหรับการกรองข้อมูล
    # --- Tracking Flags
    is_extended_fix = Column(Boolean, default=False, index=True)
    is_grossed = Column(Boolean, default=False, index=True)
    is_processed = Column(Boolean, default=False, index=True)
    is_slide_prepped = Column(Boolean, default=False, index=True)
    is_reported = Column(Boolean, default=False, index=True)
    is_out_lab_consult = Column(Boolean, default=False, index=True)
    consult_status = Column(String, nullable=True, index=True)
    consult_pdf_path = Column(String, nullable=True)
    consult_reason = Column(Text, nullable=True)
    consult_report_out_at = Column(DateTime, nullable=True)
    consult_pdf_received_at = Column(DateTime, nullable=True)
    consult_pdf_approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    consult_pdf_approved_at = Column(DateTime, nullable=True)
    has_malignancy = Column(Boolean, nullable=True)
    has_critical = Column(Boolean, default=False)
    is_pending = Column(Boolean, default=False)
    pending_reason = Column(Text, nullable=True)

    # --- Quality Assessment ---
    stain_quality = Column(Enum(QualityEnum, native_enum=False), nullable=True)
    tissue_quality = Column(Enum(QualityEnum, native_enum=False), nullable=True)
    slide_quality = Column(Enum(QualityEnum, native_enum=False), nullable=True)

    # --- Release to Patient ---
    is_slide_released = Column(Boolean, default=False, index=True)
    is_block_released = Column(Boolean, default=False, index=True)

    # --- Storage & Discard ---
    specimen_storage_status = Column(String, nullable=True)
    specimen_storage_container = Column(String, nullable=True)
    specimen_storage_at = Column(DateTime, nullable=True)
    specimen_storage_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    discard_status = Column(Boolean, default=False)
    discard_at = Column(DateTime, nullable=True)
    discard_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # --- Cancellation & Soft Delete ---
    is_cancelled = Column(Boolean, default=False, index=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancelled_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancel_reason = Column(Text, nullable=True)

    # --- 4. Relationships ---
    # เชื่อมไปยังชิ้นเนื้อ (One-to-Many)
    specimens = relationship(
        "SurgicalSpecimen", back_populates="case", cascade="all, delete-orphan"
    )

    diagnoses = relationship(
        "SurgicalDiagnosis", back_populates="case", cascade="all, delete-orphan"
    )

    reports = relationship("SurgicalReport", back_populates="case")
    request_files = relationship("SurgicalRequestFile", back_populates="case", cascade="all, delete-orphan")

    patient = relationship("Patient", back_populates="surgical_cases")
    pathologist = relationship("User", foreign_keys=[pathologist_id])
    registerer = relationship("User", foreign_keys=[registrar_id])
    hospital = relationship("Hospital")
    department = relationship("Department")
    medical_scheme = relationship("MedicalScheme")

    gross_examiner = relationship("User", foreign_keys=[gross_examiner_id])
    gross_assistant = relationship("User", foreign_keys=[gross_assistant_id])

    specimen_storer = relationship("User", foreign_keys=[specimen_storage_by_id])
    specimen_disposer = relationship("User", foreign_keys=[discard_by_id])
    consult_pdf_approver = relationship("User", foreign_keys=[consult_pdf_approved_by_id])

    # --- 5. Timestamps ---
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # --- 6. Table Args (Indexes) ---
    __table_args__ = (
        Index("idx_case_patient_lab", "patient_id", "lab_number"),
        Index("idx_case_accession_lab", "accession_no", "lab_number"),
    )

    def __repr__(self):
        return f"<SurgicalCase(accession_no='{self.accession_no}', status='{self.status}')>"


# อย่าลืมสร้างตาราง SurgicalSpecimen ที่มี case_id ชี้กลับมาที่นี่
