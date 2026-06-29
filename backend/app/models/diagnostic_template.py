from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    ForeignKey,
    func,
    Boolean,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


class DiagnosticTemplate(Base):
    __tablename__ = "diagnostic_templates"

    id = Column(Integer, primary_key=True, index=True)

    # ชื่อแม่แบบ เช่น 'Chronic Appendicitis', 'Invasive Ductal Carcinoma'
    name = Column(String(255), nullable=False, index=True)

    # ส่วนของคำวินิจฉัยหลัก (เช่น Appendix: Chronic Appendicitis)
    # รองรับ {{...}} เช่น '{{Organ}}: {{Disease}}'
    diagnosis_content = Column(Text, nullable=False)

    microscopic_content = Column(Text, nullable=True)

    # หมวดหมู่ เช่น 'GI', 'Breast', 'Skin'
    category = Column(String(100), nullable=True, index=True, default="General")

    # สถานะการใช้งาน
    is_active = Column(Boolean, default=True, nullable=False)

    # บันทึกผู้สร้าง
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    creator = relationship("User", foreign_keys=[created_by_id])

    def __repr__(self):
        return f"<DiagnosticTemplate {self.name}>"
