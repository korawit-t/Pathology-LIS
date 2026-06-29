from sqlalchemy import Column, Integer, String, Boolean, Date, JSON
from sqlalchemy.orm import relationship
from app.db.database import Base


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # e.g. Pathologist, Lab Tech
    description = Column(String, nullable=True)


class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    code = Column(String, unique=True, nullable=True)  # e.g. H001
    address = Column(String, nullable=True)
    logo_path = Column(String, nullable=True)  # เก็บ path รูปโลโก้ รพ. ไว้โชว์ใน report

    surgical_cases = relationship("SurgicalCase", back_populates="hospital")


class Title(Base):
    __tablename__ = "titles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, unique=True, nullable=False)  # เช่น "นาย", "Dr."


class MedicalScheme(Base):
    __tablename__ = "medical_schemes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # เช่น "ชำระเงินเอง", "บัตรทอง"
    code = Column(String, unique=True, nullable=True)  # เช่น "CASH", "UCS"

    surgical_cases = relationship("SurgicalCase", back_populates="medical_scheme")


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(
        String, unique=True, nullable=False
    )  # เช่น "Surgery", "OR", "Internal Medicine"
    is_active = Column(Boolean, default=True)

    # 🌟 เพิ่ม Relationship เพื่อให้เรียกดูเคสทั้งหมดของแผนกนี้ได้
    surgical_cases = relationship("SurgicalCase", back_populates="department")

    def __repr__(self):
        return f"<Department(name='{self.name}')>"


class Holiday(Base):
    """
    ตารางสำหรับเก็บวันหยุดนักขัตฤกษ์
    เพื่อให้ระบบ TAT หักวันเหล่านี้ออกจากระยะเวลาที่ใช้ตรวจจริง
    """

    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)
    # 🚩 เก็บเป็น Date เพื่อให้เปรียบเทียบ (Compare) ได้แม่นยำและห้ามซ้ำ
    holiday_date = Column(Date, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)  # เช่น "วันสงกรานต์", "วันขึ้นปีใหม่"


class SystemConfig(Base):
    """Key-value store for system-level configuration (e.g. Google Calendar API key)."""

    __tablename__ = "system_configs"

    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=True)
