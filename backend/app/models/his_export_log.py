from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON, Index, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class HisExportLog(Base):
    """Outbox/delivery log for outbound report exports to an external HIS.

    One row = one export "episode" for a report. Automatic retries update the
    same row; a manual retry inserts a new row so history is preserved. At
    most one row may be active (pending/processing) per resource at a time —
    enforced by a partial unique index (see migration).
    """

    __tablename__ = "his_export_logs"

    id = Column(Integer, primary_key=True, index=True)

    resource_type = Column(String(50), nullable=False)  # SurgicalReport | GyneCytoReport | NongyneCytoReport
    resource_id = Column(Integer, nullable=False)
    accession_no = Column(String(50), nullable=True)

    status = Column(String(20), nullable=False, default="pending")  # pending|processing|sent|dead_letter|cancelled
    adapter_type = Column(String(50), nullable=True)  # snapshot of HIS_EXPORT_TYPE at enqueue time

    payload_snapshot = Column(JSON, nullable=True)
    response_snapshot = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    his_reference_id = Column(String, nullable=True)

    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=8)
    next_attempt_at = Column(DateTime, nullable=True)
    claimed_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)

    triggered_by = Column(String(20), nullable=False, default="auto")  # auto | manual
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    created_by = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        # Worker's poll query: due pending rows + stale processing rows
        Index("ix_his_export_logs_status_next_attempt", "status", "next_attempt_at"),
        # Lookup by resource (e.g. "show export history for report #42")
        Index("ix_his_export_logs_resource", "resource_type", "resource_id"),
        Index("ix_his_export_logs_accession_no", "accession_no"),
        # Partial unique: at most one active (pending/processing) row per resource.
        # Multiple terminal rows over time are fine (manual retries preserve history).
        Index(
            "uq_his_export_logs_active_resource",
            "resource_type",
            "resource_id",
            unique=True,
            postgresql_where=text("status IN ('pending', 'processing')"),
        ),
    )
