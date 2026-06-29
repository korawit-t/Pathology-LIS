from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey
from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    title_id = Column(Integer, ForeignKey("titles.id"), nullable=True)
    name = Column(String, index=True, nullable=False)
    ln = Column(String, index=True, nullable=True)
    gender = Column(String, nullable=True)
    cid = Column(String, unique=True, index=True, nullable=True)
    birth_date = Column(Date, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    title = relationship("Title")

    surgical_cases = relationship(
        "SurgicalCase",
        back_populates="patient",
        cascade="all, delete-orphan",  # (Optional) ลบคนไข้แล้วลบเคสทั้งหมด
    )

    gyne_cytology_cases = relationship("GyneCytologyCase", back_populates="patient")
    nongyne_cytology_cases = relationship("NongyneCytologyCase", back_populates="patient")

    @property
    def age_display(self):
        if not self.birth_date:
            return "-"

        from datetime import date
        # คำนวณเทียบกับวันปัจจุบัน หรือวันรับเคส
        diff = relativedelta(date.today(), self.birth_date)

        if diff.years >= 2:
            return f"{diff.years} Y"
        elif diff.years >= 1:
            return f"{diff.years} Y {diff.months} M"
        elif diff.months >= 1:
            return f"{diff.months} M {diff.days} D"
        else:
            return f"{diff.days} D"
