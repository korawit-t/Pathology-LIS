"""
Surgical Diagnosis Data Model

This model is designed to support both:
1) Specimen-level diagnoses (traditional pathology workflow)
2) Case-level (integrated) diagnoses that summarize multiple specimens into
   a single diagnostic statement for reporting purposes.

Key design principles:
- All diagnoses (specimen-level and case-level) are stored in the same table
  to preserve versioning, audit trails, and signing workflows.
- The `diagnosis_level` field explicitly defines whether a diagnosis applies
  to an individual specimen or to the entire surgical case.
- Case-level diagnoses do NOT overwrite specimen-level diagnoses; they act as
  a higher-level, report-oriented composition.
- This structure allows flexible report rendering while maintaining data
  integrity and traceability back to individual specimens.
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Boolean,
    Text,
    func,
    UniqueConstraint,
    Index,
    Enum,
    JSON,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base
from app.enums.surgical_diagnosis_enums import DiagnosisLevel


# --- Main Surgical Diagnosis table ---
class SurgicalDiagnosis(Base):
    """
    Core table for storing surgical pathology diagnoses.

    This table supports:
    - Multiple diagnoses per specimen
    - Versioning (original, revised, addendum)
    - Case-level integrated diagnoses
    - Full audit trail and signing workflow

    A diagnosis is considered:
    - Specimen-level if diagnosis_level == SPECIMEN
    - Case-level if diagnosis_level == CASE
    """

    __tablename__ = "surgical_diagnoses"
    __table_args__ = (
        # Enforces ordering uniqueness per specimen (SPECIMEN-level only)
        UniqueConstraint(
            "surgical_specimen_id", "diagnosis_order", name="_specimen_diag_order_uc"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Foreign key to the parent surgical case
    case_id = Column(Integer, ForeignKey("surgical_cases.id"), nullable=False)

    # Reference to previous version (for revisions / addenda)
    previous_version_id = Column(
        Integer, ForeignKey("surgical_diagnoses.id"), nullable=True
    )

    # Defines whether this diagnosis applies to a specimen or the entire case
    diagnosis_level = Column(
        Enum(DiagnosisLevel),
        nullable=False,
        default=DiagnosisLevel.SPECIMEN,
    )

    # Links to a single specimen (used only when diagnosis_level == SPECIMEN)
    surgical_specimen_id = Column(
        Integer, ForeignKey("surgical_specimens.id"), nullable=True
    )

    # List of specimen IDs included in a CASE-level diagnosis
    # Example: [1, 2, 3] representing specimens A–C
    linked_specimen_ids = Column(JSON, nullable=True)

    # Ordering of diagnoses within the same specimen
    diagnosis_order = Column(Integer, default=1)

    # Version type of the diagnosis entry
    # Examples: 'Original', 'Addendum', 'Revised'
    entry_type = Column(String, default="Original")

    # Diagnostic content sections
    microscopic_description = Column(Text, nullable=True)
    diagnosis = Column(Text, nullable=True)

    # Timestamp when the diagnosis was made
    diagnosis_at = Column(DateTime, nullable=True)

    # Optional comments or notes
    comment = Column(Text, nullable=True)

    # Reason for revision (if applicable)
    revision_reason = Column(Text, nullable=True)

    # Workflow status
    # Examples: 'draft', 'signed', 'cancelled'
    status = Column(String, default="draft")

    # Audit timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # --- Relationships ---

    # Self-referential relationship for version history
    previous_version = relationship(
        "SurgicalDiagnosis",
        remote_side=[id],
        foreign_keys=[previous_version_id],
        backref="next_versions",
    )

    # Parent case relationship
    case = relationship("SurgicalCase", back_populates="diagnoses")

    # Linked specimen (SPECIMEN-level only)
    specimen = relationship("SurgicalSpecimen", back_populates="diagnoses")
