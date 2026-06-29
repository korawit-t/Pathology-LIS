from sqlalchemy import Column, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class SurgicalSpecimenAPTest(Base):
    __tablename__ = "surgical_specimen_ap_tests"

    id = Column(Integer, primary_key=True, index=True)
    surgical_specimen_id = Column(Integer, ForeignKey("surgical_specimens.id"), nullable=False)
    ap_test_id = Column(Integer, ForeignKey("anatomical_pathology_tests.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Optional relationships
    surgical_specimen = relationship("SurgicalSpecimen", back_populates="ap_tests")
    ap_test = relationship(
    "AnatomicalPathologyTest",
    back_populates="specimens",
    lazy="joined"
)
    
    def __repr__(self):
        return f"<SurgicalSpecimenAPTest(specimen_id={self.surgical_specimen_id}, ap_test_id={self.ap_test_id})>"