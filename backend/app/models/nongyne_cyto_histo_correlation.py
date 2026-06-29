from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class NongyneCytoHistoCorrelation(Base):
    __tablename__ = "nongyne_cyto_histo_correlations"

    id = Column(Integer, primary_key=True, index=True)

    # Exactly one of these is set; case_type discriminates
    nongyne_case_id = Column(Integer, ForeignKey("nongyne_cytology_cases.id"), nullable=True, index=True)
    gyne_case_id    = Column(Integer, ForeignKey("gyne_cytology_cases.id"),    nullable=True, index=True)
    case_type       = Column(String(10), nullable=False, default="nongyne")  # "gyne" | "nongyne"

    surgical_accession_no = Column(String, nullable=False, index=True)
    surgical_case_id = Column(Integer, ForeignKey("surgical_cases.id"), nullable=True, index=True)

    cytology_diagnosis_snapshot = Column(Text, nullable=True)
    histology_diagnosis = Column(Text, nullable=True)
    correlation_result = Column(String(30), nullable=False)  # agree | minor_discrepancy | major_discrepancy | no_follow_up
    comment = Column(Text, nullable=True)

    correlated_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    correlated_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    nongyne_case = relationship("NongyneCytologyCase")
    gyne_case    = relationship("GyneCytologyCase")
    surgical_case = relationship("SurgicalCase")
    correlated_by = relationship("User")
