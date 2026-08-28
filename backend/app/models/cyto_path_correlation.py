from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    JSON,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


class CytoPathCorrelation(Base):
    """QC ledger comparing what the cytotechnologist screened against the
    pathologist's signed-out final diagnosis.

    One row per cytology case. The screening side is frozen when the cytotech
    hands the case over; the final side is frozen at sign-out. Shared by gyne
    and non-gyne through `case_type`, the same shape as
    `NongyneCytoHistoCorrelation`.
    """

    __tablename__ = "cyto_path_correlations"
    __table_args__ = (
        UniqueConstraint(
            "case_type", "gyne_case_id", "nongyne_case_id", name="uq_cyto_path_corr_case"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Exactly one of the two case FKs is set; case_type discriminates
    case_type = Column(String(10), nullable=False, index=True)  # "gyne" | "nongyne"
    gyne_case_id = Column(Integer, ForeignKey("gyne_cytology_cases.id"), nullable=True, index=True)
    nongyne_case_id = Column(
        Integer, ForeignKey("nongyne_cytology_cases.id"), nullable=True, index=True
    )
    accession_no = Column(String, nullable=True, index=True)

    # ── Screening side: frozen when the cytotech sends the case on ──
    cytotechnologist_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    screening_diagnosis = Column(Text, nullable=True)
    screening_summary = Column(Text, nullable=True)
    screening_flags = Column(JSON, nullable=True)
    screened_at = Column(DateTime, nullable=True)

    # ── Final side: frozen at sign-out ──
    pathologist_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    final_diagnosis = Column(Text, nullable=True)
    final_summary = Column(Text, nullable=True)
    final_flags = Column(JSON, nullable=True)
    signed_out_at = Column(DateTime, nullable=True, index=True)
    version_no = Column(Integer, default=1)

    # ── Verdict ──
    auto_result = Column(String(20), nullable=True, comment="hint only: identical | changed")
    result = Column(
        String(30),
        nullable=True,
        comment="concordant | minor_discrepancy | major_discrepancy | not_applicable",
    )
    status = Column(
        String(20),
        nullable=False,
        default="awaiting_signout",
        index=True,
        comment="awaiting_signout | pending_review | reviewed | no_screening_data",
    )
    discrepancy_category = Column(
        String(40),
        nullable=True,
        comment="interpretive | screening_miss | sampling | wording | other",
    )
    comment = Column(Text, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    gyne_case = relationship("GyneCytologyCase")
    nongyne_case = relationship("NongyneCytologyCase")
    cytotechnologist = relationship("User", foreign_keys=[cytotechnologist_id])
    pathologist = relationship("User", foreign_keys=[pathologist_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
