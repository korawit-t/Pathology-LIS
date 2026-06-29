from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, func, Boolean, JSON
from sqlalchemy.orm import relationship
from app.db.database import Base

class GrossTemplate(Base):
    __tablename__ = "gross_templates"

    id = Column(Integer, primary_key=True, index=True)
    
    # ชื่อแม่แบบ เช่น 'Appendix Standard', 'Gallbladder Cholecystitis'
    name = Column(String, nullable=False, index=True)
    
    # เนื้อหาโครงสร้างที่มีเครื่องหมาย {{...}}
    # เช่น 'Received in formalin is appendix, measuring {{L}} x {{D}} cm.'
    raw_content = Column(Text, nullable=False)
    
    # หมวดหมู่เพื่อการค้นหาที่ง่ายขึ้น เช่น 'GI', 'Skin', 'Breast'
    category = Column(String, nullable=True, index=True, default="General")
    
    # สถานะการใช้งาน
    is_active = Column(Boolean, default=True, nullable=False)
    # [{"tissue_description": "...", "tissue_count": 3, "is_tissue_uncountable": false}, ...]
    block_templates = Column(JSON, nullable=True)

    # บันทึกผู้สร้าง (FK ไปยังตาราง users)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    creator = relationship("User", foreign_keys=[created_by_id])

    def __repr__(self):
        return f"<GrossTemplate {self.name}>"