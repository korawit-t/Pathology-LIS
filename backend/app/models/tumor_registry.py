from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class TumorRegistry(Base):
    __tablename__ = "tumor_registries"

    id = Column(Integer, primary_key=True, index=True)
    surgical_case_id = Column(Integer, ForeignKey("surgical_cases.id"), nullable=False, unique=True, index=True)

    # ICD-O-3 Topography
    topography_code = Column(String, nullable=True)   # e.g. C50.1
    topography_desc = Column(String, nullable=True)   # e.g. Breast, upper-outer quadrant

    # ICD-O-3 Morphology
    morphology_code = Column(String, nullable=True)   # e.g. 8500/3
    morphology_desc = Column(String, nullable=True)   # e.g. Infiltrating duct carcinoma

    # Histologic Grade
    grade = Column(String, nullable=True)             # G1 / G2 / G3 / GX

    # TNM Staging
    pt = Column(String, nullable=True)                # e.g. pT1c
    pn = Column(String, nullable=True)                # e.g. pN1
    pm = Column(String, nullable=True)                # e.g. pM0

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    surgical_case = relationship("SurgicalCase", backref="tumor_registry", uselist=False)
    created_by = relationship("User", foreign_keys=[created_by_id])
