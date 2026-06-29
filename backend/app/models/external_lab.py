from sqlalchemy import Column, Integer, String, Boolean, DateTime, func
from app.db.database import Base

class ExternalLab(Base):
    __tablename__ = "external_labs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
