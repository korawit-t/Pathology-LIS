from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, func, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.database import Base


class IHCResult(Base):
    """Structured IHC result per specimen per marker, saved by pathologist."""
    __tablename__ = "ihc_results"

    __table_args__ = (
        UniqueConstraint("surgical_specimen_id", "ap_test_id", name="_ihc_specimen_marker_uc"),
    )

    id = Column(Integer, primary_key=True, index=True)
    surgical_specimen_id = Column(Integer, ForeignKey("surgical_specimens.id", ondelete="CASCADE"), nullable=False, index=True)
    ap_test_id = Column(Integer, ForeignKey("anatomical_pathology_tests.id", ondelete="CASCADE"), nullable=False, index=True)

    selected_option = Column(String(200), nullable=True)   # chosen option_value
    numeric_value = Column(Float, nullable=True)           # e.g. 40.0 for Ki67 40%
    note = Column(Text, nullable=True)                     # free-text override/supplement

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    specimen = relationship("SurgicalSpecimen")
    ap_test = relationship("AnatomicalPathologyTest")
