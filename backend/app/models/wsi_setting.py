from sqlalchemy import Boolean, Column, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.db.database import Base


class WsiScannerProfile(Base):
    __tablename__ = "wsi_scanner_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    filename_pattern = Column(String, nullable=False)
    file_extensions = Column(JSON, nullable=False, default=list)
    separator = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)


class WsiSetting(Base):
    __tablename__ = "wsi_settings"

    id = Column(Integer, primary_key=True, index=True)
    hospital_slug = Column(String, unique=True, index=True, default="master")
    wsi_root_path = Column(String, nullable=True)
    default_scanner_profile_id = Column(
        Integer, ForeignKey("wsi_scanner_profiles.id"), nullable=True
    )

    default_scanner_profile = relationship(
        "WsiScannerProfile", foreign_keys=[default_scanner_profile_id]
    )
