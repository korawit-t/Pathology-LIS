from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base

class SlideStorageRun(Base):
    __tablename__ = "slide_storage_runs"

    id = Column(Integer, primary_key=True, index=True)
    # รหัสรอบการจัดเก็บ เช่น S-STORE-20250121-001
    run_no = Column(String, unique=True, index=True) 
    started_at = Column(DateTime, default=datetime.now)
    finished_at = Column(DateTime, nullable=True)
    
    # พนักงานที่จัดเก็บ
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # ประเภทการย้อม: HE, Special, IHC
    stain_category = Column(String(50), nullable=True)

    # หมายเหตุเพิ่มเติม
    remark = Column(String, nullable=True)

    # การทำลาย
    discard_status = Column(Boolean, default=False, nullable=False)
    discard_at     = Column(DateTime, nullable=True)
    discard_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationship
    details    = relationship("SlideStorageDetail", back_populates="run", cascade="all, delete-orphan")
    operator   = relationship("User", foreign_keys=[user_id])
    discard_by = relationship("User", foreign_keys=[discard_by_id])

class SlideStorageDetail(Base):
    __tablename__ = "slide_storage_details"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("slide_storage_runs.id", ondelete="CASCADE"))
    
    # อ้างอิงไปยังสไลด์(การย้อม) ที่จัดเก็บ — ใช้เพียงหนึ่งในสาม FK ตามประเภทงาน
    stain_id = Column(Integer, ForeignKey("surgical_block_stains.id", ondelete="CASCADE"), nullable=True)
    gyne_stain_id = Column(Integer, ForeignKey("gyne_cyto_stains.id", ondelete="CASCADE"), nullable=True)
    nongyne_stain_id = Column(Integer, ForeignKey("nongyne_cyto_stains.id", ondelete="CASCADE"), nullable=True)

    # ตำแหน่งที่จัดเก็บ เช่น ลิ้นชักที่ 1, ถาด 2, ช่อง 15
    storage_location = Column(String, nullable=True)

    stored_at = Column(DateTime, default=datetime.now)

    remark = Column(String, nullable=True)

    # การทำลาย
    discard_status = Column(Boolean, default=False, nullable=False)
    discard_at     = Column(DateTime, nullable=True)
    discard_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    run          = relationship("SlideStorageRun", back_populates="details")
    stain        = relationship("SurgicalBlockStain")
    gyne_stain   = relationship("GyneCytologyStain")
    nongyne_stain = relationship("NongyneCytologyStain")
    discard_by   = relationship("User", foreign_keys=[discard_by_id])
