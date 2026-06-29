from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, func, Index
from sqlalchemy.orm import relationship
from app.db.database import Base
from app.models.surgical_case import SurgicalCase
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.nongyne_cyto_case import NongyneCytologyCase


class SlideBlockRelease(Base):
    __tablename__ = "slide_block_releases"

    id = Column(Integer, primary_key=True, index=True)

    # รหัสใบจำหน่าย เช่น REL-2026-0001
    release_no = Column(String(20), unique=True, index=True, nullable=False)

    # Polymorphic case reference (เหมือน SlideDispatchItem)
    case_id = Column(Integer, nullable=False, index=True)
    case_type = Column(String(50), nullable=False)  # SURGICAL | GYNE_CYTO | NONGYNE_CYTO

    # ประเภทสิ่งที่จำหน่าย
    release_type = Column(String(10), nullable=False)  # SLIDE | BLOCK | BOTH

    # ผู้รับ / ผู้ขอ / เอกสารอ้างอิง
    recipient_name = Column(String(200), nullable=False)
    requester_name = Column(String(200), nullable=True)
    reference_doc_no = Column(String(100), nullable=True)
    remark = Column(Text, nullable=True)

    # Pathologist signature
    pathologist_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pathologist_name = Column(String(200), nullable=True)  # snapshot

    # Audit
    released_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    released_at = Column(DateTime, default=func.now(), nullable=False)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    released_by = relationship("User", foreign_keys=[released_by_id])
    pathologist = relationship("User", foreign_keys=[pathologist_id])

    surgical_case = relationship(
        "SurgicalCase",
        primaryjoin="and_(SlideBlockRelease.case_id == SurgicalCase.id, SlideBlockRelease.case_type == 'SURGICAL')",
        foreign_keys=[case_id],
        remote_side=[SurgicalCase.id],
        viewonly=True,
    )

    gyne_cyto_case = relationship(
        "GyneCytologyCase",
        primaryjoin="and_(SlideBlockRelease.case_id == GyneCytologyCase.id, SlideBlockRelease.case_type == 'GYNE_CYTO')",
        foreign_keys=[case_id],
        remote_side=[GyneCytologyCase.id],
        viewonly=True,
    )

    nongyne_cyto_case = relationship(
        "NongyneCytologyCase",
        primaryjoin="and_(SlideBlockRelease.case_id == NongyneCytologyCase.id, SlideBlockRelease.case_type == 'NONGYNE_CYTO')",
        foreign_keys=[case_id],
        remote_side=[NongyneCytologyCase.id],
        viewonly=True,
    )

    __table_args__ = (
        Index("idx_release_case", "case_id", "case_type"),
    )

    def __repr__(self):
        return f"<SlideBlockRelease(release_no='{self.release_no}', case_type='{self.case_type}', release_type='{self.release_type}')>"
