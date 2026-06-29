from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base
from sqlalchemy.sql import func


class NongyneRequestFile(Base):
    __tablename__ = "nongyne_request_files"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("nongyne_cytology_cases.id"), nullable=False, index=True)
    file_path = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)

    uploaded_at = Column(DateTime, default=func.now())
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    case = relationship("NongyneCytologyCase", back_populates="request_files")
    uploader = relationship("User", foreign_keys=[uploaded_by_id])
