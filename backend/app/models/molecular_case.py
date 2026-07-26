from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class MolecularCase(Base):
    __tablename__ = "molecular_cases"

    id = Column(Integer, primary_key=True, index=True)
    accession_no = Column(String, index=True, unique=True, nullable=False, comment="M26-00001")

    # Origin — EITHER ordered on an existing Surgical case's block (parent_case_id set,
    # patient/hospital/etc. resolved through the parent) OR registered standalone
    # (parent_case_id/stain_id null, patient_id/hospital_id/etc. below are then required).
    parent_case_id = Column(Integer, ForeignKey("surgical_cases.id", ondelete="CASCADE"), nullable=True, index=True)
    stain_id = Column(Integer, ForeignKey("surgical_block_stains.id", ondelete="SET NULL"), nullable=True, index=True)
    ap_test_id = Column(Integer, ForeignKey("anatomical_pathology_tests.id"), nullable=False)

    # Standalone registration fields — only populated when parent_case_id is null.
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    medical_scheme_id = Column(Integer, ForeignKey("medical_schemes.id"), nullable=True)
    hn = Column(String, index=True, nullable=True)
    an = Column(String, nullable=True)
    vn = Column(String, nullable=True)
    clinical_diagnosis = Column(Text, nullable=True)
    clinician_name = Column(String, nullable=True)
    collect_at = Column(DateTime, nullable=True)

    status = Column(String, default="pending", index=True)  # 'pending' -> 'reported'
    is_outlab = Column(Boolean, default=False, nullable=False)  # seeded from ap_test.is_external, editable on the result page

    result_text = Column(Text, nullable=True)  # free-text summary (primary if in-house, supplementary if outlab)
    outlab_pdf_path = Column(String, nullable=True)  # external lab's report — the primary artifact when is_outlab
    outlab_pdf_received_at = Column(DateTime, nullable=True)

    registrar_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    registered_at = Column(DateTime, default=func.now())
    reported_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reported_at = Column(DateTime, nullable=True)

    # Assisting/requesting pathologist — editable at any time regardless of
    # origin. Defaults to the ordering pathologist (registrar_id) when spawned
    # from a block-level stain order (see create_molecular_case_from_stain);
    # picked explicitly on standalone/"from Surgical case" registration forms.
    assist_pathologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    is_cancelled = Column(Boolean, default=False, index=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancelled_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancel_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    parent_case = relationship("SurgicalCase")
    stain_order = relationship("SurgicalBlockStain")
    ap_test = relationship("AnatomicalPathologyTest")
    patient = relationship("Patient")
    hospital = relationship("Hospital")
    department = relationship("Department")
    medical_scheme = relationship("MedicalScheme")
    registrar = relationship("User", foreign_keys=[registrar_id])
    reported_by = relationship("User", foreign_keys=[reported_by_id])
    cancelled_by = relationship("User", foreign_keys=[cancelled_by_id])
    assist_pathologist = relationship("User", foreign_keys=[assist_pathologist_id])

    def __repr__(self):
        return f"<MolecularCase(accession_no='{self.accession_no}', status='{self.status}')>"
