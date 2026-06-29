from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class CytoReportAuditLog(Base):
    """Approval/rejection audit log for Gyne and Non-Gyne cytology reports.

    report_id has no FK constraint because gyne and nongyne reports live in
    separate tables — this is intentionally polymorphic (see report_type).
    """

    __tablename__ = "cyto_report_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String, nullable=False)   # "gyne" | "nongyne"
    report_id = Column(Integer, nullable=False, index=True)

    approver_id = Column(Integer, nullable=False)
    approver_name = Column(String, nullable=False)

    action = Column(String, nullable=False)        # APPROVED | REJECTED | REQUEST_CHANGES | COSIGNED
    comment = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
