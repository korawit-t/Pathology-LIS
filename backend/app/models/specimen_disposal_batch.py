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


class SpecimenDisposalBatch(Base):
    """หนึ่งรอบการทำลายชิ้นเนื้อ = ใบตรวจสอบหนึ่งใบที่พิมพ์ออกไป

    ใบถูกพิมพ์ก่อน (status=PRINTED) แล้วถือไปตรวจสอบหน้างาน เซ็นสามช่อง
    ค่อยกลับมากดยืนยัน (status=DISPOSED) — การทิ้งจริงจึงผูกกับเคสชุดเดียว
    กับที่อยู่บนกระดาษเสมอ ไม่ใช่ชุดที่ผู้ใช้มาเลือกใหม่ทีหลัง
    """

    __tablename__ = "specimen_disposal_batches"

    id = Column(Integer, primary_key=True, index=True)

    # เลขที่ใบ เช่น DSP-2026-0007
    batch_no = Column(String(20), unique=True, index=True, nullable=False)

    # เกณฑ์อายุที่ใช้คัดเคสรอบนี้ — snapshot ไว้เพราะนโยบายเปลี่ยนได้
    retention_days = Column(Integer, nullable=True)

    status = Column(
        String(20), nullable=False, default="PRINTED", server_default="PRINTED"
    )  # PRINTED | DISPOSED | CANCELLED

    disposal_method = Column(String(200), nullable=True)
    remark = Column(Text, nullable=True)

    printed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    printed_at = Column(
        DateTime, nullable=False, default=func.now(), server_default=func.now()
    )

    # สามผู้ลงนามบนกระดาษ — เก็บทั้ง FK และชื่อ snapshot แบบเดียวกับ
    # SlideBlockRelease.pathologist_name เพราะใบที่พิมพ์ไปแล้วต้องไม่เปลี่ยน
    # ชื่อตามการแก้โปรไฟล์ user ในภายหลัง
    disposer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    verifier_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=True)
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
        "SpecimenDisposalBatchItem",
        back_populates="batch",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<SpecimenDisposalBatch(batch_no='{self.batch_no}', status='{self.status}')>"


class SpecimenDisposalBatchItem(Base):
    __tablename__ = "specimen_disposal_batch_items"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(
        Integer,
        ForeignKey("specimen_disposal_batches.id", ondelete="CASCADE"),
        nullable=False,
    )
    case_id = Column(Integer, ForeignKey("surgical_cases.id"), nullable=False)

    # กล่องที่เคสอยู่ ณ ตอนพิมพ์ใบ — ถ้ามีการย้ายกล่องทีหลัง ใบเดิมยังพิมพ์ซ้ำได้ตรงเป๊ะ
    container_snapshot = Column(String, nullable=True)

    batch = relationship("SpecimenDisposalBatch", back_populates="items")
    case = relationship("SurgicalCase", foreign_keys=[case_id])

    __table_args__ = (
        UniqueConstraint("batch_id", "case_id", name="uq_disposal_batch_case"),
        Index("idx_disposal_item_case", "case_id"),
    )

    def __repr__(self):
        return f"<SpecimenDisposalBatchItem(batch_id={self.batch_id}, case_id={self.case_id})>"
