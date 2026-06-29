from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.database import Base


class LlmProfile(Base):
    __tablename__ = "llm_profiles"

    id = Column(Integer, primary_key=True, index=True)
    display_name = Column(String, nullable=False)
    provider = Column(String, nullable=False, default="openai")
    model = Column(String, nullable=False)
    base_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
