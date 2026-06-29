# app/models/sectioning.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base

class SectioningRun(Base):
    __tablename__ = "sectioning_runs"

    id = Column(Integer, primary_key=True, index=True)
    # รหัสรอบการตัด เช่น SEC-20250121-001
    run_no = Column(String, unique=True, index=True) 
    started_at = Column(DateTime, default=datetime.now)
    finished_at = Column(DateTime, nullable=True)
    
    # พนักงานที่ตัดเนื้อ (Sectioner/Technologist)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # เครื่อง Microtome ที่ใช้ (กรณีมีหลายเครื่อง)
    microtome_id = Column(String, nullable=True) 

    # Relationship
    details = relationship("SectioningDetail", back_populates="run")

class SectioningDetail(Base):
    __tablename__ = "sectioning_details"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("sectioning_runs.id"))
    
    # อ้างอิงไปยัง Block ที่นำมาตัด
    block_id = Column(Integer, ForeignKey("surgical_blocks.id", ondelete="CASCADE"))
    
    # จำนวนแผ่นสไลด์ที่ตัดได้ (ปกติ 1 บล็อกอาจตัดหลายระดับ/หลายแผ่น)
    slide_count = Column(Integer, default=1)
    
    # สถานะพิเศษ เช่น ขอตัดเพิ่ม (Deep Cut) หรือตัดซ้ำ (Recut)
    is_recut = Column(Boolean, default=False)
    
    sectioned_at = Column(DateTime, default=datetime.now)
    
    # บันทึกปัญหา เช่น "เนื้อเยื่อแตก", "เนื้อเยื่อรัดตัว (Chatter)"
    remark = Column(String, nullable=True)

    # Relationship
    run = relationship("SectioningRun", back_populates="details")
    block = relationship("SurgicalBlock")