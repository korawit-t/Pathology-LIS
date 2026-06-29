from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship

from app.db.database import Base


class WsiFile(Base):
    __tablename__ = "wsi_files"

    id               = Column(Integer, primary_key=True, index=True)
    file_path        = Column(String, unique=True, nullable=False, index=True)
    filename         = Column(String, nullable=False, index=True)
    file_size_bytes  = Column(BigInteger, nullable=True)
    format           = Column(String, nullable=True)
    width_px         = Column(Integer, nullable=True)
    height_px        = Column(Integer, nullable=True)
    mpp_x            = Column(Numeric, nullable=True)
    mpp_y            = Column(Numeric, nullable=True)
    level_count      = Column(Integer, nullable=True)
    scanner_profile_id = Column(Integer, ForeignKey("wsi_scanner_profiles.id"), nullable=True)
    parsed_accession = Column(String, nullable=True, index=True)
    parsed_block     = Column(String, nullable=True)
    parse_confidence = Column(String, nullable=True)   # 'high' | 'low' | 'failed'
    discovered_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at     = Column(DateTime, nullable=True)

    scanner_profile  = relationship("WsiScannerProfile")
    slide_links      = relationship("WsiSlideLink", back_populates="wsi_file", cascade="all, delete-orphan")
