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


class NongyneCytologyCase(Base):
    __tablename__ = "nongyne_cytology_cases"

    # --- 1. Primary Key & Identification ---
    id = Column(Integer, primary_key=True, index=True)

    # เลขที่เคส Non-Gyne มักขึ้นต้นด้วย N, F (FNA), S (Sputum) เช่น N25-00001
    accession_no = Column(
        String, index=True, unique=True, nullable=False, comment="N25-00001"
    )
    lab_number = Column(String, index=True, nullable=True)

    # --- 2. Patient & Clinical Links ---
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    medical_scheme_id = Column(Integer, ForeignKey("medical_schemes.id"), nullable=True)

    hn = Column(String, index=True)
    an = Column(String, nullable=True)
    vn = Column(String, nullable=True)
    clinician_name = Column(String, nullable=True)
    collect_at = Column(DateTime, nullable=True)
    
    clinical_diagnosis = Column(Text, nullable=True)
    clinical_history = Column(Text, nullable=True)

    # --- 3. Specimen Info ---
    # เช่น FNA, Body Fluid, Urine, Sputum, CSF, Washings, Brushings
    specimen_type = Column(String, default="Fluid", index=True)
    # ระบุจุดที่เก็บ: เช่น Pleural fluid, Right Breast, Ascitic fluid
    collection_site = Column(String, nullable=True)
    
    # ปริมาณที่ได้รับ (ถ้าเป็นของเหลว)
    received_volume_ml = Column(String, nullable=True)

    # --- 4. Workflow & Staff ---
    # Non-Gyne บางที่ก็ใช้ Cytotechnologist ช่วย Screen ด้วย
    cytotechnologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pathologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    status = Column(String, default="registered", index=True)
    registrar_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    registered_at = Column(DateTime, default=func.now())

    # ขั้นตอนการทำงาน
    is_screened = Column(Boolean, default=False)
    screened_at = Column(DateTime, nullable=True)
    is_reported = Column(Boolean, default=False)
    is_pending = Column(Boolean, default=False)
    report_at = Column(DateTime, nullable=True)
    is_express = Column(Boolean, default=False, index=True)
    is_rose = Column(Boolean, default=False, index=True)
    is_out_lab_consult = Column(Boolean, default=False, index=True)
    is_out_lab = Column(Boolean, default=False, index=True)
    out_lab_result_pdf_path = Column(String, nullable=True)
    consult_status = Column(String, default="pending", index=True)
    consult_pdf_path = Column(String, nullable=True)
    is_slide_released = Column(Boolean, default=False, index=True)

    # --- Cell Block Preparation ---
    is_cell_block = Column(Boolean, default=False, index=True)
    cell_block_status = Column(String, nullable=True, comment="pending / processing / ready / failed")
    cell_block_prepared_at = Column(DateTime, nullable=True)
    cell_block_prepared_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # --- 5. Results Summary ---
    # สำหรับกรองรวดเร็ว
    has_malignancy = Column(Boolean, index=True, nullable=True)
    is_satisfied_specimen = Column(Boolean, default=True, comment="Specimen adequacy")

    # --- 6. Quality Assessment ---
    stain_quality = Column(Enum(QualityEnum, native_enum=False), nullable=True)
    slide_quality = Column(Enum(QualityEnum, native_enum=False), nullable=True)

    # --- 7. Relationships ---
    patient = relationship("Patient", back_populates="nongyne_cytology_cases")
    cytotechnologist = relationship("User", foreign_keys=[cytotechnologist_id])
    pathologist = relationship("User", foreign_keys=[pathologist_id])
    registerer = relationship("User", foreign_keys=[registrar_id])
    cell_block_prepared_by = relationship("User", foreign_keys=[cell_block_prepared_by_id])
    hospital = relationship("Hospital")
    department = relationship("Department")
    medical_scheme = relationship("MedicalScheme")

    # TODO: Add diagnoses relationship like GyneCytologyCase in the future
    stains = relationship("NongyneCytologyStain", back_populates="case", cascade="all, delete-orphan")
    diagnoses = relationship("NongyneDiagnosis", back_populates="case", cascade="all, delete-orphan")
    reports = relationship("NongyneCytoReport", back_populates="case", cascade="all, delete-orphan")
    images = relationship("NongyneCaseImage", back_populates="case", cascade="all, delete-orphan", order_by="NongyneCaseImage.order")
    request_files = relationship("NongyneRequestFile", back_populates="case", cascade="all, delete-orphan")
    ihc_results = relationship("NongyneIHCResult", back_populates="case", cascade="all, delete-orphan")

    # --- 8. Timestamps ---
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<NongyneCytologyCase(accession_no='{self.accession_no}', status='{self.status}')>"
