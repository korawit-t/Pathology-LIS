from sqlalchemy import Column, Integer, String, ForeignKey, func, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.database import Base


class IHCMarkerExtraField(Base):
    """Admin-configured extra structured field on an IHC marker (AnatomicalPathologyTest),
    additive to the marker's primary selected_option/numeric_value — e.g. an independent
    "Intensity" (0/1+/2+/3+) pick alongside ER's Positive/Negative + percentage."""
    __tablename__ = "ihc_marker_extra_fields"

    __table_args__ = (
        UniqueConstraint("ap_test_id", "field_key", name="_ihc_marker_extra_field_key_uc"),
    )

    id = Column(Integer, primary_key=True, index=True)
    ap_test_id = Column(Integer, ForeignKey("anatomical_pathology_tests.id", ondelete="CASCADE"), nullable=False, index=True)

    field_key = Column(String(50), nullable=False)     # e.g. "intensity"
    label = Column(String(200), nullable=False)         # e.g. "Intensity"
    field_type = Column(String(10), nullable=False)     # "select" | "numeric" | "text"
    numeric_unit = Column(String(20), nullable=True)    # e.g. "%", "CPS" — only for field_type="numeric"
    display_order = Column(Integer, default=0)

    created_at = Column(DateTime, server_default=func.now())

    ap_test = relationship("AnatomicalPathologyTest", back_populates="ihc_extra_fields")
    options = relationship(
        "IHCMarkerExtraFieldOption",
        back_populates="field",
        cascade="all, delete-orphan",
        order_by="IHCMarkerExtraFieldOption.display_order",
    )
