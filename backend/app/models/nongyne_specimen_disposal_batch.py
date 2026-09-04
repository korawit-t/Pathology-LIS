from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.db.database import Base


class NongyneSpecimenDisposalBatch(Base):
    """หนึ่งรอบการทำลายสิ่งส่งตรวจ non-gyne = ใบตรวจสอบหนึ่งใบที่พิมพ์ออกไป

    โครงเดียวกับใบของ surgical (app/models/specimen_disposal_batch.py) —
    พิมพ์ใบก่อน (status=PRINTED) ถือไปตรวจสอบหน้างาน เซ็นสามช่อง แล้วกลับมา
    ยืนยัน (DISPOSED) หรือยกเลิก (CANCELLED)

    ต่างกันสองอย่าง: ไม่มี container เพราะ non-gyne ไม่มีขั้นตอนจัดเก็บเข้ากล่อง
    และเลขใบขึ้นต้น NDSP- เพื่อไม่ให้ลำดับปนกับ DSP- ของ surgical
    """

    __tablename__ = "nongyne_specimen_disposal_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_no = Column(String(20), unique=True, index=True, nullable=False)

    # เกณฑ์จำนวนวันหลังรายงานผลที่ใช้บังคับตอนสร้างใบ — snapshot ไว้เพราะค่าใน
    # SystemSetting เปลี่ยนได้ แต่ใบที่พิมพ์ไปแล้วต้องบอกได้ว่าตัดสินด้วยเกณฑ์ไหน
    retention_days = Column(Integer, nullable=True)

    status = Column(
        String(20), nullable=False, default="PRINTED", server_default="PRINTED"
    )
    disposal_method = Column(String(200), nullable=True)
    remark = Column(Text, nullable=True)

    printed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    printed_at = Column(
        DateTime, nullable=False, default=func.now(), server_default=func.now()
    )

    disposer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    verifier_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # snapshot ชื่อ ณ ตอนพิมพ์ — กระดาษที่เซ็นไปแล้วต้องไม่เปลี่ยนตามชื่อในระบบ
    disposer_name = Column(String(200), nullable=True)
    verifier_name = Column(String(200), nullable=True)
    approver_name = Column(String(200), nullable=True)

    disposed_at = Column(DateTime, nullable=True)
    disposed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    cancelled_at = Column(DateTime, nullable=True)
    cancelled_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancel_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    printed_by = relationship("User", foreign_keys=[printed_by_id])
    disposer = relationship("User", foreign_keys=[disposer_id])
    verifier = relationship("User", foreign_keys=[verifier_id])
    approver = relationship("User", foreign_keys=[approver_id])
    disposed_by = relationship("User", foreign_keys=[disposed_by_id])
    cancelled_by = relationship("User", foreign_keys=[cancelled_by_id])

    items = relationship(
        "NongyneSpecimenDisposalBatchItem",
        back_populates="batch",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return (
            f"<NongyneSpecimenDisposalBatch(batch_no='{self.batch_no}', "
            f"status='{self.status}')>"
        )


class NongyneSpecimenDisposalBatchItem(Base):
    __tablename__ = "nongyne_specimen_disposal_batch_items"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(
        Integer,
        ForeignKey("nongyne_specimen_disposal_batches.id", ondelete="CASCADE"),
        nullable=False,
    )
    case_id = Column(
        Integer, ForeignKey("nongyne_cytology_cases.id"), nullable=False
    )

    batch = relationship("NongyneSpecimenDisposalBatch", back_populates="items")
    case = relationship("NongyneCytologyCase", foreign_keys=[case_id])

    __table_args__ = (
        UniqueConstraint("batch_id", "case_id", name="uq_ng_disposal_batch_case"),
        Index("idx_ng_disposal_item_case", "case_id"),
    )

    def __repr__(self):
        return (
            f"<NongyneSpecimenDisposalBatchItem(batch_id={self.batch_id}, "
            f"case_id={self.case_id})>"
        )
