from sqlalchemy import Column, Integer, String, Boolean, DateTime, func, JSON
from app.db.database import Base

class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String, nullable=False, comment="line, slack, discord, etc.")
    name = Column(String, nullable=False, comment="Name to remember, e.g., 'Server Alert', 'Support Team'")
    credentials = Column(JSON, nullable=False, comment="Stores channel specific configs like token or webhook url")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
