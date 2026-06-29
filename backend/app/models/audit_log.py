from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String, nullable=False)        # CREATE | UPDATE | DELETE
    resource_type = Column(String, nullable=False) # e.g. "SurgicalCase"
    resource_id = Column(Integer, nullable=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        # Fast lookup by resource (e.g. "show me all changes to case #42")
        Index("ix_audit_resource", "resource_type", "resource_id"),
        # Fast lookup by user + date range (e.g. "what did Dr. X do this week?")
        Index("ix_audit_user_date", "user_id", "created_at"),
        # Fast filter by action type + date (e.g. "all DELETEs this month")
        Index("ix_audit_action_date", "action", "created_at"),
    )
