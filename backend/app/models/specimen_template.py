from sqlalchemy import Column, Integer, String
from app.db.database import Base


class SpecimenTemplate(Base):
    __tablename__ = "specimen_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    # "surgical" | "gyne_cyto" | "nongyne_cyto"
    category = Column(String, default="surgical", nullable=False, index=True)

    def __repr__(self):
        return f"<SpecimenTemplate(name='{self.name}')>"
