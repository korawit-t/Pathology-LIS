from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base


class IHCMarkerExtraFieldOption(Base):
    """Selectable option for a "select"-type IHCMarkerExtraField (e.g. Intensity's 0/1+/2+/3+ rows)."""
    __tablename__ = "ihc_marker_extra_field_options"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(Integer, ForeignKey("ihc_marker_extra_fields.id", ondelete="CASCADE"), nullable=False, index=True)

    option_label = Column(String(200), nullable=False)
    option_value = Column(String(200), nullable=False)
    display_order = Column(Integer, default=0)

    field = relationship("IHCMarkerExtraField", back_populates="options")
