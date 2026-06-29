from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class SurgicalCaseCorrelation(Base):
    __tablename__ = "surgical_case_correlations"

    id = Column(Integer, primary_key=True, index=True)

    from_case_id = Column(Integer, ForeignKey("surgical_cases.id"), nullable=False, index=True)
    to_case_id   = Column(Integer, ForeignKey("surgical_cases.id"), nullable=False, index=True)
    from_accession_no = Column(String, nullable=False)
    to_accession_no   = Column(String, nullable=False)

    # agree | minor_discrepancy | major_discrepancy | no_follow_up
    correlation_result = Column(String(30), nullable=False)
    comment = Column(Text, nullable=True)

    correlated_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    correlated_at = Column(DateTime, server_default=func.now())
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, server_default=func.now(), onupdate=func.now())

    from_case      = relationship("SurgicalCase", foreign_keys=[from_case_id])
    to_case        = relationship("SurgicalCase", foreign_keys=[to_case_id])
    correlated_by  = relationship("User")
