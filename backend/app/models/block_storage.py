from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base

class BlockStorageRun(Base):
    __tablename__ = "block_storage_runs"

    id = Column(Integer, primary_key=True, index=True)
    # รหัสรอบการจัดเก็บ เช่น STORE-20250121-001
    run_no = Column(String, unique=True, index=True) 
    started_at = Column(DateTime, default=datetime.now)
    finished_at = Column(DateTime, nullable=True)
    
    # พนักงานที่จัดเก็บ
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # หมายเหตุเพิ่มเติม
    remark = Column(String, nullable=True)

    # การทำลาย
    discard_status = Column(Boolean, default=False, nullable=False)
    discard_at     = Column(DateTime, nullable=True)
    discard_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationship
    details    = relationship("BlockStorageDetail", back_populates="run", cascade="all, delete-orphan")
    operator   = relationship("User", foreign_keys=[user_id])
    discard_by = relationship("User", foreign_keys=[discard_by_id])

class BlockStorageDetail(Base):
    __tablename__ = "block_storage_details"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("block_storage_runs.id"))
    
    # อ้างอิงไปยัง Block ที่จัดเก็บ
    block_id = Column(Integer, ForeignKey("surgical_blocks.id", ondelete="CASCADE"))
    
    # ตำแหน่งที่จัดเก็บ เช่น ตะกร้าที่ 1, ชั้นที่ 2, ตำแหน่ง 1A
    storage_location = Column(String, nullable=True)
    
    stored_at = Column(DateTime, default=datetime.now)
    
    remark = Column(String, nullable=True)

    # การทำลาย
    discard_status = Column(Boolean, default=False, nullable=False)
    discard_at     = Column(DateTime, nullable=True)
    discard_by_id  = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationship
    run        = relationship("BlockStorageRun", back_populates="details")
    block      = relationship("SurgicalBlock")
    discard_by = relationship("User", foreign_keys=[discard_by_id])
