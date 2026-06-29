from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class NongyneCytologyStain(Base):
    __tablename__ = "nongyne_cyto_stains"

    id = Column(Integer, primary_key=True, index=True)
    # เชื่อมตรงกับ Case เพราะงาน Cytology สไลด์เกิดจาก Case โดยตรง
    case_id = Column(
        Integer,
        ForeignKey("nongyne_cytology_cases.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ข้อมูลการย้อม
    # 'Pap Stain', 'H&E', 'Diff-Quik'
    test_id = Column(
        Integer, ForeignKey("anatomical_pathology_tests.id"), nullable=False
    )
    slide_no = Column(Integer, default=1)  # แผ่นที่เท่าไหร่ของเคสนี้ (เช่น Pap 1, Pap 2)

    # สถานะการดำเนินงาน
    status = Column(String, default="pending")  # 'pending', 'stained', 'completed'

    # การพิมพ์สติกเกอร์ (สำคัญมากสำหรับติดสไลด์)
    is_printed = Column(Boolean, default=False)
    printed_at = Column(DateTime, nullable=True)
    printed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    case = relationship("NongyneCytologyCase", back_populates="stains")

    test = relationship("AnatomicalPathologyTest")

    # เชื่อมกับ Run Detail
    run_details = relationship("NongyneStainRunDetail", back_populates="stain_order")

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    @property
    def accession_no(self):
        if self.case:
            return self.case.accession_no
        return None


class NongyneStainRun(Base):
    __tablename__ = "nongyne_stain_runs"  # 🚩 สร้างตารางคุมการย้อมของ Nongyne เอง

    id = Column(Integer, primary_key=True, index=True)
    run_no = Column(String, unique=True, index=True)
    stainer_id = Column(String)
    operator_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String, default="completed")
    created_at = Column(DateTime, default=func.now())
    started_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime, nullable=True)

    details = relationship("NongyneStainRunDetail", back_populates="stain_run")


class NongyneStainRunDetail(Base):
    __tablename__ = "nongyne_stain_run_details"

    id = Column(Integer, primary_key=True, index=True)
    stain_run_id = Column(
        Integer,
        ForeignKey("nongyne_stain_runs.id", ondelete="CASCADE"),  # 🚩 เปลี่ยนมาชี้ที่นี่
        nullable=False,
    )
    stain_id = Column(
        Integer, ForeignKey("nongyne_cyto_stains.id", ondelete="CASCADE"), nullable=False
    )

    is_success = Column(Boolean, default=True)
    remark = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now())

    stain_run = relationship("NongyneStainRun", back_populates="details")
    stain_order = relationship("NongyneCytologyStain", back_populates="run_details")

    @property
    def accession_no(self):
        if self.stain_order and self.stain_order.case:
            return self.stain_order.case.accession_no
        return None
