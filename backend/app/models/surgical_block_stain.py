from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.models.anatomical_pathology_test import AnatomicalPathologyTest


class SurgicalBlockStain(Base):
    __tablename__ = "surgical_block_stains"

    id = Column(Integer, primary_key=True, index=True)
    block_id = Column(
        Integer, ForeignKey("surgical_blocks.id", ondelete="CASCADE"), nullable=False
    )

    # ข้อมูลการย้อม
    test_id = Column(
        Integer, ForeignKey("anatomical_pathology_tests.id"), nullable=True
    )
    slide_no = Column(Integer, default=1)  # แผ่นที่เท่าไหร่ของตลับนี้

    # สถานะการดำเนินงาน
    status = Column(String, default="pending")  # 'pending', 'stained', 'completed'

    # Recut request (ordered by pathologist)
    is_recut = Column(Boolean, default=False)
    recut_note = Column(Text, nullable=True)

    # การพิมพ์สติกเกอร์
    is_printed = Column(Boolean, default=False)
    printed_at = Column(DateTime, nullable=True)
    printed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # ผู้ดำเนินการย้อม
    stained_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    # หมายเหตุ: ต้องมั่นใจว่าใน SurgicalBlock มี back_populates="stains" ด้วย
    block = relationship("SurgicalBlock", back_populates="stains")

    # Relationship ไปยัง Master Data
    test = relationship("AnatomicalPathologyTest")
    stained_by = relationship("User", foreign_keys=[stained_by_id])

    run_details = relationship(
        "SurgicalStainRunDetail",
        back_populates="stain_order",
        cascade="all, delete-orphan",
    )

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    @property
    def accession_no(self):
        try:
            return self.block.specimen.case.accession_no
        except AttributeError:
            return None

    @property
    def block_code(self):
        try:
            return self.block.block_code
        except AttributeError:
            return None

    @property
    def test_name(self):
        try:
            return self.test.name
        except AttributeError:
            return None

    @property
    def test_category(self):
        try:
            return self.test.category
        except AttributeError:
            return None


class SurgicalStainRun(Base):
    __tablename__ = "surgical_stain_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_no = Column(String, unique=True, index=True)
    stainer_id = Column(
        String, nullable=True
    )  # ✅ เปลี่ยนจาก machine_name เป็น stainer_id แล้ว

    # 💡 เพิ่มบรรทัดนี้ เพื่อเก็บ ID ของผู้ใช้งานลง DB
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    started_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, default="running")

    details = relationship(
        "SurgicalStainRunDetail",
        back_populates="stain_run",
        cascade="all, delete-orphan",
    )

    # 💡 เชื่อม Relationship โดยอ้างอิงจาก operator_id ด้านบน
    operator = relationship("User", foreign_keys=[operator_id])


class SurgicalStainRunDetail(Base):
    __tablename__ = "surgical_stain_run_details"

    id = Column(Integer, primary_key=True, index=True)
    # เพิ่ม ondelete="CASCADE"
    stain_run_id = Column(
        Integer,
        ForeignKey("surgical_stain_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    stain_id = Column(
        Integer,
        ForeignKey("surgical_block_stains.id", ondelete="CASCADE"),
        nullable=False,
    )

    is_success = Column(Boolean, default=True)
    remark = Column(String, nullable=True)

    # เพิ่มเวลาที่บันทึกผล (Optional)
    created_at = Column(DateTime, default=func.now())

    stain_run = relationship("SurgicalStainRun", back_populates="details")
    stain_order = relationship("SurgicalBlockStain", back_populates="run_details")

    # 🌟 เพิ่ม Property เหล่านี้เพื่อให้ดึงข้อมูลข้ามตารางได้ง่ายขึ้น
    @property
    def accession_no(self):
        # ต้องผ่าน stain_order -> block -> specimen -> case
        if (
            self.stain_order
            and self.stain_order.block
            and self.stain_order.block.specimen
            and self.stain_order.block.specimen.case
        ):
            return self.stain_order.block.specimen.case.accession_no
        return None

    @property
    def block_code(self):
        # ดึงจาก property ของ SurgicalBlock โดยตรง (จะได้ "A1", "A2")
        if self.stain_order and self.stain_order.block:
            return self.stain_order.block.block_code
        return None

class SurgicalOutlabRun(Base):
    __tablename__ = "surgical_outlab_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_no = Column(String, unique=True, index=True)
    destination_lab = Column(String, nullable=True)

    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    sent_at = Column(DateTime, default=func.now())
    received_at = Column(DateTime, nullable=True)
    received_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="sent")  # 'sent', 'partial', 'received'
    tracking_number = Column(String(200), nullable=True)

    details = relationship(
        "SurgicalOutlabRunDetail",
        back_populates="outlab_run",
        cascade="all, delete-orphan",
    )
    operator = relationship("User", foreign_keys=[operator_id])
    received_by = relationship("User", foreign_keys=[received_by_id])

class SurgicalOutlabRunDetail(Base):
    __tablename__ = "surgical_outlab_run_details"

    id = Column(Integer, primary_key=True, index=True)
    outlab_run_id = Column(
        Integer,
        ForeignKey("surgical_outlab_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    stain_id = Column(
        Integer,
        ForeignKey("surgical_block_stains.id", ondelete="CASCADE"),
        nullable=False,
    )

    is_success = Column(Boolean, default=True)
    remark = Column(String, nullable=True)
    is_hosxp_keyed = Column(Boolean, default=False, nullable=False)
    hosxp_keyed_at = Column(DateTime, nullable=True)
    received_at = Column(DateTime, nullable=True)
    received_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now())

    outlab_run = relationship("SurgicalOutlabRun", back_populates="details")
    stain_order = relationship("SurgicalBlockStain")
    received_by = relationship("User", foreign_keys=[received_by_id])

    @property
    def accession_no(self):
        if (
            self.stain_order
            and self.stain_order.block
            and self.stain_order.block.specimen
            and self.stain_order.block.specimen.case
        ):
            return self.stain_order.block.specimen.case.accession_no
        return None

    @property
    def block_code(self):
        if self.stain_order and self.stain_order.block:
            return self.stain_order.block.block_code
        return None
