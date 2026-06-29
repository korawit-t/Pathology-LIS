from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, func, Index, JSON
from sqlalchemy.orm import relationship
from app.db.database import Base


class CriticalNotificationLog(Base):
    __tablename__ = "critical_notification_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Polymorphic case reference
    case_id = Column(Integer, nullable=False, index=True)
    case_type = Column(String(50), nullable=False)  # SURGICAL | GYNE_CYTO | NONGYNE_CYTO
    accession_no = Column(String(50), nullable=True, index=True)

    # ประเภทการแจ้ง
    notification_type = Column(String(50), nullable=False)  # critical_value | malignancy | other

    # วันเวลาที่แจ้ง (user-entered, ไม่ใช่ server time)
    notified_at = Column(DateTime, nullable=False)

    # ผู้รับแจ้ง
    recipient_name = Column(String(200), nullable=True)
    recipient_role = Column(String(100), nullable=True)

    # หมายเหตุ
    note = Column(Text, nullable=True)

    # Channels ที่ส่งไป (snapshot ชื่อ)
    notified_channel_names = Column(JSON, nullable=True)

    # ผู้แจ้ง (auto-fill จาก current user)
    notified_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    notified_by = relationship("User", foreign_keys=[notified_by_id])

    __table_args__ = (
        Index("idx_critical_notif_case", "case_id", "case_type"),
        Index("idx_critical_notif_at", "notified_at"),
    )
