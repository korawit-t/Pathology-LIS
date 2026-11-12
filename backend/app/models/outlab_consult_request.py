from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.utils.time import local_now


# One row per consult round a case goes through. The case's own consult_*
# columns are only a cache of its latest round, written by
# crud.outlab_consult_request.sync_case_summary — never set them directly.
CONSULT_REQUESTED = "requested"              # pathologist asked for it, not shipped yet
CONSULT_SENT = "sent"                        # in a run, slides out of the lab
CONSULT_RESULT_RECEIVED = "result_received"  # external lab's PDF on file, not reviewed
CONSULT_APPROVED = "approved"                # pathologist reviewed the PDF; ready to release
CONSULT_REPORTED = "reported"                # released on a published report round
CONSULT_CANCELLED = "cancelled"

# A case has at most one consult in one of these at a time.
CONSULT_ACTIVE_STATUSES = (
    CONSULT_REQUESTED,
    CONSULT_SENT,
    CONSULT_RESULT_RECEIVED,
    CONSULT_APPROVED,
)

# Printed on report covers: reviewed, whether or not released yet.
CONSULT_PRINTABLE_STATUSES = (CONSULT_APPROVED, CONSULT_REPORTED)


class OutlabConsultRequest(Base):
    __tablename__ = "outlab_consult_requests"

    id = Column(Integer, primary_key=True, index=True)

    # Polymorphic: "surgical" | "gyne" | "nongyne". Plain int, no FK — same
    # pattern as OutlabConsultRunDetail and InternalConsult.
    case_type = Column(String, nullable=False)
    case_id = Column(Integer, nullable=False)

    seq = Column(Integer, nullable=False)  # 1, 2, 3… per case
    # S26-01234-C1. Indexed, not unique: (case_type, case_id, seq) already is,
    # and accession prefixes are per-site settings, so two case types could in
    # principle share one — a unique index would then fail a publish.
    consult_no = Column(String, nullable=False, index=True)

    status = Column(String, nullable=False, default=CONSULT_REQUESTED, index=True)
    reason = Column(Text, nullable=True)
    destination_lab = Column(String, nullable=True)

    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    requested_at = Column(DateTime, default=local_now)

    result_pdf_path = Column(String, nullable=True)
    result_received_at = Column(DateTime, nullable=True)
    result_uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    external_ref = Column(String, nullable=True)           # the destination lab's own number
    external_pathologist = Column(String, nullable=True)   # who read it there
    concordance = Column(String, nullable=True)            # concordant | minor_discordant | major_discordant

    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    # JSON list of base64 JPEG data URIs, one per PDF page — rasterized once
    # at approve so report rounds reference this row instead of each carrying
    # their own copy.
    pdf_thumbnails = Column(Text, nullable=True)

    # The report round that first released this consult (its table follows case_type).
    reported_in_report_id = Column(Integer, nullable=True)
    reported_at = Column(DateTime, nullable=True)

    cancelled_at = Column(DateTime, nullable=True)
    cancelled_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancel_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=local_now)
    updated_at = Column(DateTime, default=local_now, onupdate=local_now)

    requested_by = relationship("User", foreign_keys=[requested_by_id])
    result_uploaded_by = relationship("User", foreign_keys=[result_uploaded_by_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])
    cancelled_by = relationship("User", foreign_keys=[cancelled_by_id])

    __table_args__ = (
        UniqueConstraint("case_type", "case_id", "seq", name="uq_outlab_consult_requests_case_seq"),
        Index("ix_outlab_consult_requests_case", "case_type", "case_id"),
    )
