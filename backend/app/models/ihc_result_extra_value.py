from sqlalchemy import Column, Integer, String, ForeignKey, func, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.database import Base


class IHCResultExtraValue(Base):
    """Pathologist-entered value for one IHCMarkerExtraField, alongside a specimen's
    primary IHCResult (selected_option/numeric_value). Stored as String regardless of
    field_type — numeric fields store the stringified number, select fields store the
    chosen option_value, text fields store raw text."""
    __tablename__ = "ihc_result_extra_values"

    __table_args__ = (
        UniqueConstraint("ihc_result_id", "field_id", name="_ihc_result_extra_field_uc"),
    )

    id = Column(Integer, primary_key=True, index=True)
    ihc_result_id = Column(Integer, ForeignKey("ihc_results.id", ondelete="CASCADE"), nullable=False, index=True)
    field_id = Column(Integer, ForeignKey("ihc_marker_extra_fields.id", ondelete="CASCADE"), nullable=False, index=True)

    value = Column(String(200), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    result = relationship("IHCResult")
    field = relationship("IHCMarkerExtraField")
