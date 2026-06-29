from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Boolean
from sqlalchemy.orm import relationship
from app.db.database import Base # ใช้ Base ตัวเดียวกับ SurgicalSpecimen

class GrossImage(Base):
    __tablename__ = "gross_images"

    id = Column(Integer, primary_key=True, index=True) 
    
    # FK ชี้กลับไปที่ SurgicalSpecimen
    specimen_id = Column(Integer, ForeignKey("surgical_specimens.id"), nullable=False, index=True)
    
    # Path/URL ของรูปภาพ (เช่น S3 URL หรือ Path ใน Server)
    image_url = Column(String, nullable=False, comment="Path or URL to the stored image file")
    
    # ชื่อไฟล์เดิม (เพื่อประโยชน์ในการแสดงผล)
    original_filename = Column(String, nullable=True) 
    
    # คำอธิบายรูปภาพ (ถ้ามี)
    description = Column(String, nullable=True) 
    
    # 🚩 Added for deciding whether to include in generated PDF report
    show_in_report = Column(Boolean, default=True)

    # ลำดับรูปภาพ (ถ้าต้องการให้เรียงลำดับ)
    order = Column(Integer, default=1)
    
    # Timestamps
    uploaded_at = Column(DateTime, default=func.now())
    
    # ความสัมพันธ์ ORM (Relationship)
    specimen = relationship("SurgicalSpecimen", back_populates="gross_images")

    def __repr__(self):
        return f"<GrossImage(specimen_id={self.specimen_id}, url='{self.image_url[:20]}...')>"