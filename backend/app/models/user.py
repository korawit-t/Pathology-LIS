from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON, Table
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.sql import func
from app.db.database import Base


user_hospitals = Table(
    "user_hospitals",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("hospital_id", Integer, ForeignKey("hospitals.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=True)

    hashed_password = Column(String, nullable=False)

    full_name = Column(String, nullable=True)
    report_name = Column(String, nullable=True)

    # Foreign Keys
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=True)

    # Relationships
    # ✅ เทคนิค: ใส่ชื่อ Class เป็น String "Position"
    # SQLAlchemy จะไปตามหา Class นั้นให้เอง แม้อยู่คนละไฟล์
    position = relationship("Position")
    hospitals = relationship("Hospital", secondary=user_hospitals, backref="users")

    @property
    def hospital_ids(self):
        return [h.id for h in self.hospitals]

    # Relationships กลับไปยัง SurgicalCase
    # 1. เคสที่คนนี้เป็นคนลงทะเบียน (Registerer)
    registered_cases = relationship(
        "SurgicalCase",
        foreign_keys="[SurgicalCase.registrar_id]",
        back_populates="registerer",
    )

    # 2. เคสที่คนนี้เป็นพยาธิแพทย์เจ้าของเคส (Pathologist)
    assigned_cases = relationship(
        "SurgicalCase",
        foreign_keys="[SurgicalCase.pathologist_id]",
        back_populates="pathologist",
    )

    # 3. เคสที่คนนี้เป็นคนตรวจเนื้อ (Gross Examiner)
    gross_examined_cases = relationship(
        "SurgicalCase",
        foreign_keys="[SurgicalCase.gross_examiner_id]",
        back_populates="gross_examiner",
    )

    # 4. เคสที่คนนี้เป็นคนช่วยตรวจเนื้อ (Gross Assistant)
    gross_assisted_cases = relationship(
        "SurgicalCase",
        foreign_keys="[SurgicalCase.gross_assistant_id]",
        back_populates="gross_assistant",
    )

    sent_dispatches = relationship(
        "SlideDispatchRun",
        foreign_keys="[SlideDispatchRun.sender_id]",
        back_populates="sender",
    )
    received_dispatches = relationship(
        "SlideDispatchRun",
        foreign_keys="[SlideDispatchRun.pathologist_id]",
        back_populates="pathologist",
    )

    # 🚩 เพิ่มฟิลด์สำหรับเก็บความชอบของผู้ใช้
    # default จะตั้งให้เป็น Top Menu ตามที่คุณต้องการ
    preferences = Column(
        JSON,
        nullable=False,
        server_default='{"layout_mode": "top", "theme": "light", "is_split_mode": false, "patient_info_expanded": true, "diagnosis_mode": "individual", "show_navigator": true}',
    )
    roles = Column(ARRAY(String), nullable=False, default=[])

    last_login = Column(DateTime, nullable=True)

    is_temporary_password = Column(Boolean, default=False, nullable=False)

    # Account lockout — incremented on every failed login; reset on success.
    # After MAX_FAILED_LOGINS consecutive failures the account is locked until
    # locked_until (set to now + LOCKOUT_DURATION_MINUTES in the auth router).
    failed_login_attempts = Column(Integer, default=0, nullable=False, server_default="0")
    locked_until = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    last_update_password = Column(DateTime, nullable=True)

    status = Column(Boolean, default=True)
