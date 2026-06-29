from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    func,
    Boolean,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


class SurgicalBlock(Base):
    __tablename__ = "surgical_blocks"

    __table_args__ = (
        # 🌟 หนึ่งชิ้นเนื้อ (A) ห้ามมีเลข Block ซ้ำกัน (A1 มีได้อันเดียว)
        UniqueConstraint("specimen_id", "block_no", name="uq_specimen_block_no"),
    )

    id = Column(Integer, primary_key=True, index=True)

    # FK ไปยัง surgical_specimens
    specimen_id = Column(
        Integer, ForeignKey("surgical_specimens.id"), nullable=False, index=True
    )

    # ข้อมูลพื้นฐานของ Block
    block_no = Column(Integer, nullable=False)  # เช่น 1, 2, 3

    status = Column(
        String, default="grossed", nullable=False, index=True
    )  # 'grossed', 'processed', 'embedded', 'sectioned', 'stained'
    is_fixing = Column(Boolean, default=False, nullable=False)

    # --- ข้อมูล Extended Fixation ---
    fix_start_at = Column(DateTime, nullable=True)
    fix_start_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    fix_end_at = Column(DateTime, nullable=True)
    fix_end_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # --- ข้อมูล Decalcification (Decal) ---

    is_decal = Column(Boolean, default=False, nullable=False)

    # บันทึกตอนนำเข้า Decal
    decal_start_at = Column(DateTime, nullable=True)
    decal_start_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # บันทึกตอนนำออก
    decal_end_at = Column(DateTime, nullable=True)
    decal_end_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # -------------------------------------

    tissue_count = Column(Integer, nullable=True)
    is_tissue_uncountable = Column(Boolean, default=False, nullable=False)
    tissue_description = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=func.now(), index=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    specimen = relationship("SurgicalSpecimen", back_populates="blocks")

    # เพิ่ม Relationship ไปยัง User (ถ้าต้องการดึงชื่อผู้บันทึกได้ง่ายๆ)
    fix_start_user = relationship("User", foreign_keys=[fix_start_by_id])
    fix_end_user = relationship("User", foreign_keys=[fix_end_by_id])
    decal_start_user = relationship("User", foreign_keys=[decal_start_by_id])
    decal_end_user = relationship("User", foreign_keys=[decal_end_by_id])

    # เพิ่ม Relationship กับ TissueProcessingItem
    processing_record = relationship(
        "TissueProcessingItem",
        back_populates="block",
        uselist=False,
        cascade="all, delete-orphan",
        single_parent=True,
    )

    # เพิ่ม Relationship กับ SurgicalBlockStain
    stains = relationship(
        "SurgicalBlockStain", back_populates="block", cascade="all, delete-orphan"
    )

    events = relationship(
        "SurgicalBlockEvent",
        back_populates="block",
        cascade="all, delete-orphan",
        order_by="SurgicalBlockEvent.event_at",
    )

    @property
    def specimen_label(self):
        # 🌟 ดึง "A" จาก SurgicalSpecimen มาให้โดยอัตโนมัติ
        return self.specimen.specimen_label if self.specimen else ""

    @property
    def block_code(self):
        return f"{self.specimen_label}{self.block_no}"

    def __repr__(self):
        return f"<Block {self.block_code}>"

    # 🌟 เพิ่ม Property นี้เข้าไป
    @property
    def accession_no(self):
        if self.specimen and self.specimen.case:
            return self.specimen.case.accession_no
        return None

    # 🌟 เพิ่ม specimen_name ไปด้วยเลย เพื่อให้หน้าตารางโชว์ชื่ออวัยวะได้ง่ายๆ
    @property
    def specimen_name(self):
        return self.specimen.specimen_name if self.specimen else None
