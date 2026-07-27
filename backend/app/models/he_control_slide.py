from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.db.database import Base


class HEControlSlide(Base):
    """Daily H&E QC control slide — not tied to any patient/case.
    A redo (e.g. the first slide of the day failed) is recorded as a new
    row, not an edit, so this table has no updated_at / no delete."""

    __tablename__ = "he_control_slides"

    id = Column(Integer, primary_key=True, index=True)

    control_no = Column(String, nullable=False, index=True)
    control_date = Column(Date, nullable=False, index=True)

    performed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    performed_by = relationship("User", foreign_keys=[performed_by_id])

    performed_at = Column(DateTime, nullable=False, default=func.now())
    created_at = Column(DateTime, default=func.now())
