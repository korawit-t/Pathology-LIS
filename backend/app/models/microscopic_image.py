from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Text, Boolean
from sqlalchemy.orm import relationship
from app.db.database import Base

class MicroscopicImage(Base):
    __tablename__ = "microscopic_images"

    id = Column(Integer, primary_key=True, index=True) 
    
    # FK ชี้กลับไปที่ SurgicalSpecimen
    specimen_id = Column(Integer, ForeignKey("surgical_specimens.id"), nullable=False, index=True)
    
    # URL หรือ Path ของไฟล์รูป
    image_url = Column(String, nullable=False)
    original_filename = Column(String, nullable=True)
    
    # ข้อมูลเฉพาะของ Microscopic
    magnification = Column(String, nullable=True, comment="เช่น 4x, 10x, 40x")
    stain = Column(String, nullable=True, comment="เช่น H&E, PAS, IHC(ER)")
    
    # คำอธิบายลักษณะทางจุลพยาธิวิทยา
    description = Column(Text, nullable=True) 
    
    # 🚩 Added for deciding whether to include in generated PDF report
    show_in_report = Column(Boolean, default=True)

    # ลำดับการแสดงผล
    sort_order = Column(Integer, default=1)
    
    # Timestamps และ User ที่อัปโหลด
    uploaded_at = Column(DateTime, default=func.now())
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Relationships
    specimen = relationship("SurgicalSpecimen", back_populates="microscopic_images")
    uploader = relationship("User")

    def __repr__(self):
        return f"<MicroscopicImage(id={self.id}, specimen_id={self.specimen_id}, stain='{self.stain}')>"