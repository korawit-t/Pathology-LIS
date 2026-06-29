from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.database import Base

class OutlabConsultRun(Base):
    __tablename__ = "outlab_consult_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_no = Column(String, unique=True, index=True) # e.g. CONS26-00001
    destination_lab = Column(String, nullable=True)

    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    sent_at = Column(DateTime, default=func.now())
    status = Column(String, default="sent")  # 'sent', 'received'
    tracking_number = Column(String, nullable=True)
    received_at = Column(DateTime, nullable=True)
    received_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    details = relationship(
        "OutlabConsultRunDetail",
        back_populates="run",
        cascade="all, delete-orphan",
    )
    operator = relationship("User", foreign_keys=[operator_id])
    received_by = relationship("User", foreign_keys=[received_by_id])


class OutlabConsultRunDetail(Base):
    __tablename__ = "outlab_consult_run_details"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(
        Integer,
        ForeignKey("outlab_consult_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    # Polymorphic-like storage
    case_type = Column(String, nullable=False) # 'surgical', 'gyne', 'nongyne'
    case_id = Column(Integer, nullable=False)
    
    # Store access variables directly to avoid complex multi-table joins when just displaying the tracking history list
    accession_no = Column(String, nullable=True, index=True)
    patient_name = Column(String, nullable=True)
    block_code = Column(String, nullable=True)
    report_out_at = Column(DateTime, nullable=True)

    remark = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now())

    block_returned = Column(Boolean, default=False)
    block_returned_at = Column(DateTime, nullable=True)
    block_returned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    run = relationship("OutlabConsultRun", back_populates="details")
    block_returned_by = relationship("User", foreign_keys=[block_returned_by_id])
