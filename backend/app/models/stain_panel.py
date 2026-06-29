from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class StainPanel(Base):
    __tablename__ = "stain_panels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=True, index=True, default="General")
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by_id])
    items = relationship(
        "StainPanelItem",
        back_populates="panel",
        cascade="all, delete-orphan",
        order_by="StainPanelItem.sort_order",
    )

    def __repr__(self):
        return f"<StainPanel {self.name}>"


class StainPanelItem(Base):
    __tablename__ = "stain_panel_items"

    id = Column(Integer, primary_key=True, index=True)
    stain_panel_id = Column(
        Integer, ForeignKey("stain_panels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    test_id = Column(
        Integer, ForeignKey("anatomical_pathology_tests.id", ondelete="CASCADE"), nullable=False
    )
    sort_order = Column(Integer, default=0, nullable=False)

    panel = relationship("StainPanel", back_populates="items")
    test = relationship("AnatomicalPathologyTest", foreign_keys=[test_id])
