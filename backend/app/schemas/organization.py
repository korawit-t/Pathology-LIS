from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from typing import List, Optional
from typing import Optional


# --- Hospital Schemas ---
class HospitalBase(BaseModel):
    name: str
    code: Optional[str] = None
    address: Optional[str] = None


class HospitalCreate(HospitalBase):
    pass


class HospitalUpdate(HospitalBase):
    name: Optional[str] = None


class HospitalResponse(HospitalBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- Position Schemas ---
class PositionBase(BaseModel):
    name: str
    description: Optional[str] = None


class PositionCreate(PositionBase):
    pass


class PositionUpdate(PositionBase):
    name: Optional[str] = None


class PositionResponse(PositionBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- Title Schemas ---
class TitleBase(BaseModel):
    title: str


class TitleCreate(TitleBase):
    pass


class TitleUpdate(TitleBase):
    title: str


class TitleResponse(TitleBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- Medical Scheme ---
class MedicalSchemeBase(BaseModel):
    name: str
    code: Optional[str] = None


class MedicalSchemeCreate(MedicalSchemeBase):
    pass


class MedicalSchemeUpdate(MedicalSchemeBase):
    name: Optional[str] = None


class MedicalSchemeResponse(MedicalSchemeBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- Department Schemas ---
class DepartmentBase(BaseModel):
    name: str
    is_active: Optional[bool] = True

    model_config = ConfigDict(from_attributes=True)


# สำหรับรับข้อมูลเวลาสร้างใหม่ (POST)
class DepartmentCreate(DepartmentBase):
    pass


# สำหรับรับข้อมูลเวลาอัปเดต (PATCH/PUT)
class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


# สำหรับส่งข้อมูลกลับไปที่ Frontend (GET)
class Department(DepartmentBase):
    id: int


# สำหรับกรณีที่ต้องการดึงข้อมูลแผนก พร้อมรายชื่อเคสที่เกี่ยวข้อง (Optional)
class DepartmentWithSpecimens(Department):
    # หมายเหตุ: ต้องระวังเรื่อง Circular Import กับ SurgicalSpecimen Schema
    # แนะนำให้ใช้ Schema แบบย่อสำหรับแสดงผลเคส
    surgical_specimens: List[dict] = []


# --- Holiday Schemas ---
class HolidayBase(BaseModel):
    holiday_date: date  # ใช้ประเภท date เพื่อรับ "YYYY-MM-DD"
    name: str


class HolidayCreate(HolidayBase):
    pass


class HolidayUpdate(BaseModel):
    holiday_date: Optional[date] = None
    name: Optional[str] = None


class HolidayResponse(HolidayBase):
    id: int

    # ใช้ ConfigDict สำหรับ Pydantic v2 เพื่อรองรับ SQLAlchemy model
    model_config = ConfigDict(from_attributes=True)
