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
    Date,
)
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.enums.quality_enum import QualityEnum


class GyneCytologyCase(Base):
    __tablename__ = "gyne_cytology_cases"

    # --- 1. Primary Key & Identification ---
    id = Column(Integer, primary_key=True, index=True)

    # เลขที่เคส Cytology มักขึ้นต้นด้วย C หรือ P เช่น C25-00001
    accession_no = Column(
        String, index=True, unique=True, nullable=False, comment="C25-00001"
    )
    lab_number = Column(String, index=True, nullable=True)

    # --- 2. Patient & Clinical Links ---
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    medical_scheme_id = Column(Integer, ForeignKey("medical_schemes.id"), nullable=True)

    hn = Column(String, index=True)
    clinician_name = Column(String, nullable=True)
    collect_at = Column(DateTime, nullable=True)

    # --- 3. Gyne Specific Clinical Data (สำคัญสำหรับ Cytology) ---
    last_menstrual_period = Column(Date, nullable=True, comment="LMP")
    is_postmenopausal = Column(Boolean, default=False)
    is_pregnant = Column(Boolean, default=False)
    hormone_therapy = Column(String, nullable=True, comment="ประวัติการใช้ฮอร์โมน")
    contraception = Column(String, nullable=True, comment="การคุมกำเนิด")
    previous_abnormal_pap = Column(Boolean, default=False)
    clinical_diagnosis = Column(Text, nullable=True)
    clinical_history = Column(Text, nullable=True)

    # --- 4. Specimen Info ---
    # เช่น Conventional Pap, Liquid Based (LBC), ThinPrep, SurePath
    specimen_type = Column(String, default="Conventional", index=True)
    # ระบุจุดที่เก็บ: Cervical, Vaginal, Endocervical
    collection_site = Column(String, default="Cervical/Endocervical")

    # --- 5. Workflow & Staff ---
    # Cytology มักมี Cytotechnologist เป็นคน Screen ก่อน
    cytotechnologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pathologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    status = Column(String, default="registered", index=True)
    registrar_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    registered_at = Column(DateTime, default=func.now())

    # ขั้นตอนของ Cytology
    is_screened = Column(Boolean, default=False)
    screened_at = Column(DateTime, nullable=True)
    is_reported = Column(Boolean, default=False)
    report_at = Column(DateTime, nullable=True)
    is_express = Column(Boolean, default=False, index=True)
    is_out_lab_consult = Column(Boolean, default=False, index=True)
    is_out_lab = Column(Boolean, default=False, index=True)
    out_lab_result_pdf_path = Column(String, nullable=True)
    consult_status = Column(String, nullable=True, index=True)
    consult_pdf_path = Column(String, nullable=True)
    consult_reason = Column(Text, nullable=True)
    consult_report_out_at = Column(DateTime, nullable=True)
    consult_pdf_received_at = Column(DateTime, nullable=True)
    outlab_report_pdf_path = Column(String, nullable=True)
    is_slide_released = Column(Boolean, default=False, index=True)

    # --- Pathologist Review (10% QC) ---
    needs_review = Column(Boolean, default=False, index=True, comment="Flagged for pathologist QC review")
    review_reason = Column(String, nullable=True, comment="random_10pct | abnormal | manual")
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_result = Column(String, nullable=True, comment="agree | disagree")
    review_note = Column(Text, nullable=True, comment="Pathologist note when disagreeing")
    discrepancy_level = Column(String, nullable=True, comment="minor | major")

    # --- 6. Results Summary (Bethesda System) ---
    # เก็บสรุปสั้นๆ สำหรับการ Filter (เช่น NILM, LSIL, HSIL)
    bethesda_category = Column(String, index=True, nullable=True)
    has_malignancy = Column(Boolean, index=True, nullable=True)
    is_satisfied_specimen = Column(Boolean, default=True, comment="Specimen adequacy")

    # --- 7. Quality Assessment ---
    stain_quality = Column(Enum(QualityEnum, native_enum=False), nullable=True)
    slide_quality = Column(Enum(QualityEnum, native_enum=False), nullable=True)

    # --- Cancellation & Soft Delete ---
    is_cancelled = Column(Boolean, default=False, server_default="false", nullable=False, index=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancelled_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancel_reason = Column(Text, nullable=True)

    # --- 8. Relationships ---
    patient = relationship("Patient", back_populates="gyne_cytology_cases")
    cytotechnologist = relationship("User", foreign_keys=[cytotechnologist_id])
    pathologist = relationship("User", foreign_keys=[pathologist_id])
    registerer = relationship("User", foreign_keys=[registrar_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    hospital = relationship("Hospital")
    department = relationship("Department")
    medical_scheme = relationship("MedicalScheme")
    stains = relationship("GyneCytologyStain", back_populates="case", cascade="all, delete-orphan")
    images = relationship(
        "GyneCaseImage",
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="GyneCaseImage.order",
    )
    # เชื่อมกับผลตรวจ Bethesda หรือ HPV (ถ้ามี)
    diagnoses = relationship(
        "GyneDiagnosis", back_populates="case", cascade="all, delete-orphan"
    )
    request_files = relationship("GyneCytoRequestFile", back_populates="case", cascade="all, delete-orphan")

    # --- 9. Timestamps ---
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<GyneCytologyCase(accession_no='{self.accession_no}', status='{self.status}')>"
