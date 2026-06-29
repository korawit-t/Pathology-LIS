from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.utils.time import local_now


class InternalConsult(Base):
    __tablename__ = "internal_consults"

    id = Column(Integer, primary_key=True, index=True)

    # Polymorphic: "surgical" | "gyne" | "nongyne"
    case_type = Column(String, nullable=False)
    # Plain int (no FK) — disambiguated by case_type, same pattern as OutlabConsultRunDetail
    report_id = Column(Integer, nullable=False)

    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    consultant_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    reason = Column(Text, nullable=False)
    opinion = Column(Text, nullable=True)

    # Denormalized snapshot for worklist display without cross-table joins
    accession_no_snapshot = Column(String, nullable=True)

    # "pending" | "responded" | "closed"
    status = Column(String, nullable=False, default="pending")
    promoted_to_signer = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=local_now)
    responded_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    requester = relationship("User", foreign_keys=[requester_id])
    consultant = relationship("User", foreign_keys=[consultant_id])

    __table_args__ = (
        Index("ix_internal_consults_consultant_status", "consultant_id", "status"),
        Index("ix_internal_consults_case_type_report", "case_type", "report_id"),
    )
