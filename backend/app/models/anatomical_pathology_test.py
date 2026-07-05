from sqlalchemy import Column, Integer, String, Float, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base


class AnatomicalPathologyTest(Base):
    __tablename__ = "anatomical_pathology_tests"

    id = Column(Integer, primary_key=True, index=True)

    code = Column(String(50), index=True)  # รหัสกรมบัญชีกลาง
    name = Column(String(255), nullable=False)  # ชื่อการตรวจ
    description = Column(Text, nullable=True)

    category = Column(
        String(100), nullable=False
    )  # IHC, Histochem, FISH, Molecular, Special stain
    is_external = Column(Boolean, default=False, nullable=False)
    outlab_id = Column(Integer, ForeignKey("external_labs.id"), nullable=True)

    system_code = Column(String(50), unique=True, nullable=True)
    is_system_default = Column(Boolean, default=False, nullable=False)

    specimen_complexity = Column(String(20), nullable=True)  # small | medium | large (Surgical Pathology only)

    price_tier_1 = Column(Float, nullable=False, default=0)  # ราคา รัฐ
    price_tier_2 = Column(Float, nullable=False, default=0)  # ราคา เอกชน
    price_tier_3 = Column(Float, nullable=False, default=0)  # ราคา กรมบัญชีกลาง

    outlab = relationship("ExternalLab", foreign_keys=[outlab_id])
    specimens = relationship("SurgicalSpecimenAPTest", back_populates="ap_test")
    ihc_options = relationship("IHCMarkerOption", back_populates="ap_test", cascade="all, delete-orphan", order_by="IHCMarkerOption.display_order")
    ihc_extra_fields = relationship("IHCMarkerExtraField", back_populates="ap_test", cascade="all, delete-orphan", order_by="IHCMarkerExtraField.display_order")
