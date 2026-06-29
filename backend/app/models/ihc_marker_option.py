from sqlalchemy import Column, Integer, String, ForeignKey, func, DateTime
from sqlalchemy.orm import relationship
from app.db.database import Base


class IHCMarkerOption(Base):
    """Admin-configured result options per IHC marker (AnatomicalPathologyTest)."""
    __tablename__ = "ihc_marker_options"

    id = Column(Integer, primary_key=True, index=True)
    ap_test_id = Column(Integer, ForeignKey("anatomical_pathology_tests.id", ondelete="CASCADE"), nullable=False, index=True)

    option_label = Column(String(200), nullable=False)   # display: "Aberrant – null pattern"
    option_value = Column(String(200), nullable=False)   # stored: "aberrant_null"
    display_order = Column(Integer, default=0)

    # Optional numeric field alongside the select option
    has_numeric = Column(String(10), nullable=True)      # None | "%" | "score" | "custom"
    numeric_unit = Column(String(20), nullable=True)     # e.g. "%", "CPS", "H-score"

    created_at = Column(DateTime, server_default=func.now())

    ap_test = relationship("AnatomicalPathologyTest", back_populates="ihc_options")
