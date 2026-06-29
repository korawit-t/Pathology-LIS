from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    ForeignKey,
    func,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.models.surgical_case import SurgicalCase
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.nongyne_cyto_case import NongyneCytologyCase


class SlideDispatchRun(Base):
    __tablename__ = "slide_dispatch_runs"

    id = Column(Integer, primary_key=True, index=True)
    dispatch_no = Column(String(20), unique=True, index=True)  # เช่น DS-2026-0001

    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pathologist_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    remark = Column(Text, nullable=True)  # 🚩 Remark รวมตรงนี้ที่เดียว
    total_cases = Column(Integer, default=0)

    sent_at = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    items = relationship(
        "SlideDispatchItem", back_populates="run", cascade="all, delete-orphan"
    )
    sender = relationship("User", foreign_keys=[sender_id])
    pathologist = relationship("User", foreign_keys=[pathologist_id])


class SlideDispatchItem(Base):
    __tablename__ = "slide_dispatch_items"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("slide_dispatch_runs.id"), nullable=False)

    case_id = Column(Integer, nullable=False, index=True)
    case_type = Column(String(50), nullable=False)  # 'SURGICAL', etc.

    status = Column(String(20), default="slide sent")

    # Relationships
    run = relationship("SlideDispatchRun", back_populates="items")

    surgical_case = relationship(
        "SurgicalCase",
        primaryjoin="and_(SlideDispatchItem.case_id == SurgicalCase.id, SlideDispatchItem.case_type == 'SURGICAL')",
        foreign_keys=[case_id],
        remote_side=[SurgicalCase.id],
        viewonly=True,
    )

    gyne_cyto_case = relationship(
        "GyneCytologyCase",
        primaryjoin="and_(SlideDispatchItem.case_id == GyneCytologyCase.id, SlideDispatchItem.case_type == 'GYNE_CYTO')",
        foreign_keys=[case_id],
        remote_side=[GyneCytologyCase.id],
        viewonly=True,
    )

    nongyne_cyto_case = relationship(
        "NongyneCytologyCase",
        primaryjoin="and_(SlideDispatchItem.case_id == NongyneCytologyCase.id, SlideDispatchItem.case_type == 'NONGYNE_CYTO')",
        foreign_keys=[case_id],
        remote_side=[NongyneCytologyCase.id],
        viewonly=True,
    )
