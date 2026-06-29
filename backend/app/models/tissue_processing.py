from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Index, func, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.database import Base

class ProcessorMachine(Base):
    __tablename__ = "processor_machines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True)

class ProcessingProgram(Base):
    __tablename__ = "processing_programs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    duration_hours = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)

class TissueProcessingRun(Base):
    __tablename__ = "tissue_processing_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_number = Column(String, unique=True, index=True, nullable=False)
    
    processor_name = Column(String, nullable=False) 
    program_name = Column(String, nullable=False)
    
    # --- ส่วนการนำเข้า (In) ---
    start_at = Column(DateTime, default=func.now(), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # จำนวนที่ระบบนับได้ตอนเข้า (Auto)
    block_in_total = Column(Integer, nullable=False, default=0)
    
    # --- ส่วนการนำออก (Out) 
    # จำนวนที่เจ้าหน้าที่นับได้ตอนออก (Manual Input)
    block_out_total = Column(Integer, nullable=True)
    completed_at = Column(DateTime, nullable=True) # เอาออกตอนไหน
    completed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True) # ใครเอาออก
    
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    status = Column(String, default="processing") 
    remark = Column(Text, nullable=True)

    # Relationships
    items = relationship("TissueProcessingItem", back_populates="run", cascade="all, delete-orphan")
    
    # เชื่อมไปยังผู้บันทึกตอนเริ่ม
    creator = relationship("User", foreign_keys=[created_by_id])
    
    # เชื่อมไปยังผู้บันทึกตอนเสร็จ (เพิ่มอันนี้)
    completer = relationship("User", foreign_keys=[completed_by_id])

    # --- วิธีการนับ Block ---
    @property
    def block_count(self):
        return len(self.items) if self.items else 0

class TissueProcessingItem(Base):
    __tablename__ = "tissue_processing_items"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("tissue_processing_runs.id"), nullable=False)
    block_id = Column(Integer, ForeignKey("surgical_blocks.id"), nullable=False)
    
    # --- ส่วนที่แนะนำให้เพิ่ม/ปรับปรุง ---
    # สถานะรายชิ้น: 'processing', 'completed', 'missing', 'damaged'
    status = Column(String, default="processing") 
    
    # บันทึกเวลาที่ Scan ออกจริงรายตลับ (ถ้ามีระบบสแกนออก)
    processed_out_at = Column(DateTime, nullable=True)
    
    # กรณีที่ Block หาย หรือมีปัญหาตอนออก
    out_remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=func.now())
    # -------------------------------

    run = relationship("TissueProcessingRun", back_populates="items")
    block = relationship("SurgicalBlock", back_populates="processing_record")