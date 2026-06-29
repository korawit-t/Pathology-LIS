from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base
from sqlalchemy.sql import func


class SurgicalRequestFile(Base):
    __tablename__ = "surgical_request_files"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("surgical_cases.id"), nullable=False, index=True)
    file_path = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False) # e.g. 'application/pdf', 'image/jpeg'

    uploaded_at = Column(DateTime, default=func.now())
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    case = relationship("SurgicalCase", back_populates="request_files")
    uploader = relationship("User", foreign_keys=[uploaded_by_id])
