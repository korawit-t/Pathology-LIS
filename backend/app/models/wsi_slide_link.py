from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.database import Base


class WsiSlideLink(Base):
    __tablename__ = "wsi_slide_links"

    id                = Column(Integer, primary_key=True, index=True)
    wsi_file_id       = Column(Integer, ForeignKey("wsi_files.id"), nullable=False, index=True)
    surgical_block_id = Column(Integer, ForeignKey("surgical_blocks.id"), nullable=False, index=True)
    stain_type        = Column(String, default="HE", nullable=False)
    is_primary        = Column(Boolean, default=True, nullable=False)
    link_method       = Column(String, nullable=True)   # 'auto_filename' | 'manual'
    link_confidence   = Column(Numeric, nullable=True)  # 0.0 – 1.0
    status            = Column(String, default="pending", nullable=False, index=True)
    # status: 'pending' | 'confirmed' | 'rejected'
    linked_by_id      = Column(Integer, ForeignKey("users.id"), nullable=True)
    linked_at         = Column(DateTime, default=datetime.utcnow, nullable=False)
    confirmed_by_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_at      = Column(DateTime, nullable=True)
    notes             = Column(Text, nullable=True)

    wsi_file       = relationship("WsiFile", back_populates="slide_links")
    surgical_block = relationship("SurgicalBlock")
    linked_by      = relationship("User", foreign_keys=[linked_by_id])
    confirmed_by   = relationship("User", foreign_keys=[confirmed_by_id])
