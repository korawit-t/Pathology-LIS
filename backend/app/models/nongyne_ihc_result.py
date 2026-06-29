from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class NongyneIHCResult(Base):
    __tablename__ = "nongyne_ihc_results"
    __table_args__ = (UniqueConstraint("case_id", "ap_test_id", name="_nongyne_ihc_case_marker_uc"),)

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("nongyne_cytology_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    ap_test_id = Column(Integer, ForeignKey("anatomical_pathology_tests.id", ondelete="CASCADE"), nullable=False, index=True)
    selected_option = Column(String(200), nullable=True)
    numeric_value = Column(Float, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    case = relationship("NongyneCytologyCase", back_populates="ihc_results")
    ap_test = relationship("AnatomicalPathologyTest")
