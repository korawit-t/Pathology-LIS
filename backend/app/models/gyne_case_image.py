from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class GyneCaseImage(Base):
    __tablename__ = "gyne_case_images"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(
        Integer,
        ForeignKey("gyne_cytology_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    image_url = Column(String, nullable=False)
    original_filename = Column(String, nullable=True)
    description = Column(String, nullable=True)
    show_in_report = Column(Boolean, default=True)
    order = Column(Integer, default=1)

    uploaded_at = Column(DateTime, server_default=func.now())

    case = relationship("GyneCytologyCase", back_populates="images")

    def __repr__(self):
        return f"<GyneCaseImage(id={self.id}, case_id={self.case_id})>"
