from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class SurgicalBlockEvent(Base):
    __tablename__ = "surgical_block_events"

    id              = Column(Integer, primary_key=True, index=True)
    block_id        = Column(
        Integer,
        ForeignKey("surgical_blocks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # SENT_TO_OUTLAB | RETURNED_FROM_OUTLAB | NOTE
    event_type      = Column(String(50), nullable=False)
    location        = Column(String(200), nullable=True)   # outlab name / institution
    note            = Column(Text, nullable=True)
    performed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    event_at        = Column(DateTime, nullable=False, default=func.now())
    created_at      = Column(DateTime, default=func.now())

    block        = relationship("SurgicalBlock", back_populates="events")
    performed_by = relationship("User", foreign_keys=[performed_by_id])
