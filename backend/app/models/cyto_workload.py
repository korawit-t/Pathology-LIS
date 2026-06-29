from sqlalchemy import Column, Integer, Numeric, Date, DateTime, Text, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class CytoWorkloadLog(Base):
    __tablename__ = "cyto_workload_logs"
    __table_args__ = (UniqueConstraint("user_id", "work_date", name="uq_cyto_workload_user_date"),)

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    work_date      = Column(Date, nullable=False, index=True)
    reading_hours  = Column(Numeric(4, 2), nullable=False, default=8.0)
    note           = Column(Text, nullable=True)
    recorded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at     = Column(DateTime, default=func.now())
    updated_at     = Column(DateTime, default=func.now(), onupdate=func.now())

    user        = relationship("User", foreign_keys=[user_id])
    recorded_by = relationship("User", foreign_keys=[recorded_by_id])
