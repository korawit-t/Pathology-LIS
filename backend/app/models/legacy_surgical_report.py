from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, JSON, func
from app.db.database import Base


class LegacySurgicalReport(Base):
    __tablename__ = "legacy_surgical_reports"

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
    patient_age_display = Column(String, nullable=True)
    patient_gender = Column(String, nullable=True)

    collect_at = Column(DateTime, nullable=True)
    registered_at = Column(DateTime, nullable=True)

    # Source snapshot
    hospital_name = Column(String, nullable=True)
    hospital_id = Column(Integer, nullable=True)
    department_name = Column(String, nullable=True)
    clinician_name = Column(String, nullable=True)

    # Diagnostic flags
    has_malignancy = Column(Boolean, default=False, nullable=True)
    has_critical = Column(Boolean, default=False, nullable=True)
    is_pending = Column(Boolean, default=False, nullable=True)
    pending_reason = Column(Text, nullable=True)

    clinical_history_snapshot = Column(Text, nullable=True)
    specimen_summary = Column(Text, nullable=True)
    gross_description_summary = Column(Text, nullable=True)
    submitted_sections_snapshot = Column(JSON, nullable=True)
    diagnosis_summary = Column(Text, nullable=True)
    microscopic_summary = Column(Text, nullable=True)
    comment_summary = Column(Text, nullable=True)

    # Signers stored as JSON (no signer sub-table for legacy)
    signers_snapshot = Column(JSON, nullable=True)

    report_type = Column(String, default="Final", nullable=True)
    pathologist_name = Column(String, nullable=True)

    lab_name_th_snapshot = Column(String, nullable=True)
    lab_name_en_snapshot = Column(String, nullable=True)
    lab_address_snapshot = Column(Text, nullable=True)
    report_footer_snapshot = Column(Text, nullable=True)
    consult_pdf_path_snapshot = Column(String, nullable=True)

    status = Column(String, default="published", nullable=True)
    approved_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)
    is_print = Column(Boolean, default=False, nullable=True)
    is_read = Column(Boolean, default=False, nullable=True)
    read_at = Column(DateTime, nullable=True)
    reported_at = Column(DateTime, nullable=True, index=True)
    version_no = Column(Integer, default=1, nullable=True)

    approved_by_id = Column(Integer, nullable=True)
    approver_name_snapshot = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<LegacySurgicalReport(id={self.id}, accession_no='{self.accession_no}')>"
