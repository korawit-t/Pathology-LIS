from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Text,
    Boolean,
    DateTime,
    func,
    JSON,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


class GyneSpecimenAdequacy(Base):
    __tablename__ = "gyne_specimen_adequacies"

    id = Column(Integer, primary_key=True, index=True)
    group_type = Column(String, index=True, nullable=False, comment="ADEQUACY, ZONE, QUALITY")
    text = Column(String, nullable=False)
    code = Column(String, nullable=True)

    def __repr__(self):
        return f"<GyneSpecimenAdequacy(group='{self.group_type}', text='{self.text}')>"


class GyneDiagnosisCategory(Base):
    __tablename__ = "gyne_diagnosis_categories"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("gyne_diagnosis_categories.id"), nullable=True)
    code = Column(String, index=True, nullable=False, unique=True)
    text = Column(String, nullable=False)
    
    # Relationship for hierarchy
    children = relationship("GyneDiagnosisCategory")

    def __repr__(self):
        return f"<GyneDiagnosisCategory(code='{self.code}', text='{self.text}')>"


class GyneDiagnosis(Base):
    __tablename__ = "gyne_diagnoses"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("gyne_cytology_cases.id"), nullable=False)

    # --- Bethesda System 2014 & Specimen Adequacy ---
    # 1. Adequacy (Satisfactory / Unsatisfactory)
    adequacy_id = Column(Integer, ForeignKey("gyne_specimen_adequacies.id"), nullable=True)
    
    # 2. Endocervical / Transformation Zone
    endocervical_status_id = Column(Integer, ForeignKey("gyne_specimen_adequacies.id"), nullable=True)
    
    # 3. Quality Indicators
    quality_id = Column(Integer, ForeignKey("gyne_specimen_adequacies.id"), nullable=True)

    # --- Categories (New Hierarchy) ---
    # Category 1 (Main Header, e.g., 100 NILM, 300 Abnormal)
    category_1_id = Column(Integer, ForeignKey("gyne_diagnosis_categories.id"), nullable=True)
    
    # Category 2 (Specific Interpretation, e.g., 101 Atrophy, 309 HSIL)
    category_2_id = Column(Integer, ForeignKey("gyne_diagnosis_categories.id"), nullable=True)

    # Legacy fields
    adequacy = Column(String, nullable=True, comment="Free text adequacy (Legacy)")
    category = Column(String, index=True, nullable=True, comment="Legacy string category") 
    interpretation = Column(Text, nullable=True, comment="ผลการวินิจฉัยโดยละเอียด")
    note = Column(Text, nullable=True, comment="หมายเหตุเพิ่มเติมหรือคำแนะนำ")

    # --- Revision Control ---
    version = Column(Integer, default=1, comment="เวอร์ชันของผลวินิจฉัย")
    is_current = Column(Boolean, default=True, comment="เป็นผลปัจจุบันหรือไม่")
    revised_reason = Column(
        Text, nullable=True, comment="เหตุผลในการแก้ไขกรณีเป็น Revised Report"
    )

    signers = Column(JSON, nullable=True, comment="List of pathologists (JSON)")

    # --- Metadata ---
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    # Relationship
    case = relationship("GyneCytologyCase", back_populates="diagnoses")
    
    # Adequacy Relationships
    adequacy_obj = relationship("GyneSpecimenAdequacy", foreign_keys=[adequacy_id])
    endocervical_status_obj = relationship("GyneSpecimenAdequacy", foreign_keys=[endocervical_status_id])
    quality_obj = relationship("GyneSpecimenAdequacy", foreign_keys=[quality_id])

    # Category Relationships
    category_1_obj = relationship("GyneDiagnosisCategory", foreign_keys=[category_1_id])
    category_2_obj = relationship("GyneDiagnosisCategory", foreign_keys=[category_2_id])

    def __repr__(self):
        return f"<GyneDiagnosis(case_id={self.case_id}, v={self.version})>"
