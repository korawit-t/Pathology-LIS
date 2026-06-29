from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, JSON, func
from app.db.database import Base


class LegacyNongyneCytoReport(Base):
    __tablename__ = "legacy_nongyne_cyto_reports"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, nullable=True)

    # Patient snapshot
    accession_no = Column(String, index=True, nullable=True)
    patient_title = Column(String, nullable=True)
    patient_name = Column(String, index=True, nullable=True)
    patient_ln = Column(String, nullable=True)
    patient_hn = Column(String, index=True, nullable=True)
    patient_cid = Column(String, nullable=True)
    patient_birth_date = Column(DateTime, nullable=True)
    patient_age = Column(Integer, nullable=True)
    patient_gender = Column(String, nullable=True)

    # Source snapshot
    hospital_name = Column(String, nullable=True)
    hospital_id = Column(Integer, nullable=True)
    department_name = Column(String, nullable=True)
    clinician_name = Column(String, nullable=True)
    clinical_history_snapshot = Column(Text, nullable=True)
    clinical_diagnosis_snapshot = Column(Text, nullable=True)

    # Specimen
    specimen_type = Column(String, nullable=True)
    collection_site = Column(String, nullable=True)

    # Diagnostic snapshot
    gross_description = Column(Text, nullable=True)
    microscopic_description = Column(Text, nullable=True)
    diagnosis = Column(Text, nullable=True)
    comment = Column(Text, nullable=True)
    has_malignancy = Column(Boolean, default=False, nullable=True)

    # Signers stored as JSON (no signer sub-table for legacy)
    signers_snapshot = Column(JSON, nullable=True)

    report_type = Column(String, default="Final", nullable=True)
    pathologist_name = Column(String, nullable=True)
    cytotechnologist_name = Column(String, nullable=True)

    lab_name_snapshot = Column(String, nullable=True)
    lab_address_snapshot = Column(Text, nullable=True)

    status = Column(String, default="published", nullable=True)
    version_no = Column(Integer, default=1, nullable=True)

    is_pending = Column(Boolean, default=False, nullable=True)
    pending_reason = Column(Text, nullable=True)
    is_print = Column(Boolean, default=False, nullable=True)
    is_read = Column(Boolean, default=False, nullable=True)
    read_at = Column(DateTime, nullable=True)

    reported_at = Column(DateTime, nullable=True, index=True)
    approved_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<LegacyNongyneCytoReport(id={self.id}, accession_no='{self.accession_no}')>"
