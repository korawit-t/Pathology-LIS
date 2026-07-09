
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Index, func, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.database import Base # สมมติว่า Base ถูก import จาก app/db/database

class SurgicalSpecimen(Base):
    __tablename__ = "surgical_specimens"

    __table_args__ = (
        # ป้องกันไม่ให้ case_id เดียวกันมี specimen_label ซ้ำกัน (เช่น มี A สองอันในเคสเดียวไม่ได้)
        UniqueConstraint('case_id', 'specimen_label', name='_case_specimen_label_uc'),
        Index("idx_specimen_case_label", "case_id", "specimen_label"),
    )

    id = Column(Integer, primary_key=True, index=True)
    
    # FK เชื่อมกลับไปที่ Case
    case_id = Column(Integer, ForeignKey("surgical_cases.id"), nullable=False)
    
    # --- Specimen Detail ---
    specimen_label = Column(String, nullable=False, comment="e.g. A, B, C")
    specimen_name = Column(String, nullable=False, comment="เช่น Appendix, Left Breast")
    
    # --- Grossing (บรรยายรายชิ้น) ---
    gross_description = Column(Text, nullable=True)
    is_entirely_submitted = Column(Boolean, default=False, nullable=False)

    # --- Additional Sections Request (ordered by pathologist) ---
    needs_additional_sections = Column(Boolean, default=False, nullable=False)
    additional_sections_note = Column(Text, nullable=True)
    additional_sections_ordered_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    additional_sections_ordered_at = Column(DateTime, nullable=True)

    # --- 🚩 Audit Fields (เพิ่มใหม่) ---
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    # onupdate=func.now() จะทำหน้าที่ update เวลาให้อัตโนมัติเมื่อมีการเปลี่ยนแปลงข้อมูลในแถวนี้
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # FK ไปยังตาราง User (สมมติว่าตาราง user ชื่อ 'users')
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # --- Relationships ---
    case = relationship("SurgicalCase", back_populates="specimens")

    # Relationship สำหรับดึงข้อมูล User ที่แก้ไขล่าสุด
    updated_by_user = relationship("User", foreign_keys=[updated_by_id])
    additional_sections_ordered_by = relationship("User", foreign_keys=[additional_sections_ordered_by_id])

    diagnoses = relationship("SurgicalDiagnosis", back_populates="specimen", cascade="all, delete-orphan")
    
    # เชื่อมต่อไปยังตารางลูกอื่นๆ (ถ้ามี)
    blocks = relationship("SurgicalBlock", back_populates="specimen", cascade="all, delete-orphan")
    gross_images = relationship("GrossImage", back_populates="specimen", cascade="all, delete-orphan")
    microscopic_images = relationship("MicroscopicImage", back_populates="specimen", cascade="all, delete-orphan")
    ap_tests = relationship("SurgicalSpecimenAPTest", back_populates="surgical_specimen", cascade="all, delete-orphan")
    

    def __repr__(self):
        return f"<SurgicalSpecimen(label='{self.specimen_label}', name='{self.specimen_name}')>"