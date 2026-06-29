# app/models/embedding.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base

class EmbeddingRun(Base):
    __tablename__ = "embedding_runs"

    id = Column(Integer, primary_key=True, index=True)
    run_no = Column(String, unique=True, index=True) # เช่น EMB-20250121-001
    started_at = Column(DateTime, default=datetime.now)
    finished_at = Column(DateTime, nullable=True)
    
    # ใครเป็นคนหล่อบล็อก (Embedder)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # สถานีที่ใช้ (ถ้ามีหลายจุด)
    station_id = Column(String, nullable=True) 

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    details = relationship("EmbeddingDetail", back_populates="run")

class EmbeddingDetail(Base):
    __tablename__ = "embedding_details"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("embedding_runs.id"))
    block_id = Column(Integer, ForeignKey("surgical_blocks.id", ondelete="CASCADE"))
    
    embedded_at = Column(DateTime, default=datetime.now)
    
    # บันทึกปัญหาที่พบระหว่างหล่อ (ถ้ามี)
    # เช่น "เนื้อเยื่อหลุด", "ต้องแบ่งเป็น 2 บล็อก"
    remark = Column(String, nullable=True)

    # Relationship
    run = relationship("EmbeddingRun", back_populates="details")
    block = relationship("SurgicalBlock") # เพื่อดึงข้อมูล block_no มาโชว์