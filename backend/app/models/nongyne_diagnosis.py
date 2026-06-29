from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, JSON, func
from sqlalchemy.orm import relationship
from app.db.database import Base

class NongyneDiagnosis(Base):
    __tablename__ = "nongyne_diagnoses"

    id = Column(Integer, primary_key=True, index=True)

    case_id = Column(Integer, ForeignKey("nongyne_cytology_cases.id"), nullable=False, index=True)

    previous_version_id = Column(Integer, ForeignKey("nongyne_diagnoses.id"), nullable=True)

    diagnosis_order = Column(Integer, default=1)
    entry_type = Column(String, default="Original")

    gross_description = Column(Text, nullable=True)
    microscopic_description = Column(Text, nullable=True)
    diagnosis = Column(Text, nullable=True)
    diagnosis_at = Column(DateTime, nullable=True)
    comment = Column(Text, nullable=True)
    revision_reason = Column(Text, nullable=True)

    status = Column(String, default="draft")
    is_current = Column(Boolean, default=True, index=True)
    signers = Column(JSON, nullable=True, comment="List of signers [{user_id, role, signed_at}]")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    previous_version = relationship(
        "NongyneDiagnosis",
        remote_side=[id],
        foreign_keys=[previous_version_id],
        backref="next_versions",
    )
    case = relationship("NongyneCytologyCase", back_populates="diagnoses")
