from pydantic import ConfigDict, BaseModel, EmailStr, Field
from typing import List
from datetime import datetime


class UserBase(BaseModel):
    username: str
    email: str | None = None
    full_name: str | None = None
    report_name: str | None = None
    position_id: int | None = None
    hospital_ids: List[int] = []
    roles: List[str] = []  # เปลี่ยนเป็น roles ที่เป็น List[str]
    preferences: dict = {"layout_mode": "top", "theme": "light", "show_navigator": True}
    status: bool = True
    is_temporary_password: bool = False


# ✅ 1. เพิ่ม password field สำหรับตอนสร้าง User ใหม่
class UserCreate(UserBase):
    email: EmailStr | None = None  # validate format on create
    # 🔒 SECURITY: minimum length enforced server-side.
    password: str = Field(..., min_length=8, max_length=128)
    is_temporary_password: bool = True


# ✅ 2. เพิ่ม password field สำหรับตอนแก้ไข (เป็น Optional เผื่อไม่อยากเปลี่ยนรหัส)
class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    report_name: str | None = None
    position_id: int | None = None
    hospital_ids: List[int] | None = None
    roles: List[str] | None = None
    status: bool | None = None
    # 🔒 SECURITY: minimum length enforced server-side when present.
    password: str | None = Field(default=None, min_length=8, max_length=128)
    is_temporary_password: bool | None = None


# ✅ 3. UserResponse ไม่ต้องมี password (ปลอดภัยแล้ว)
class UserResponse(UserBase):
    id: int
    last_login: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    last_update_password: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class PasswordUpdate(BaseModel):
    # 🔒 SECURITY: enforce a minimum length server-side. The frontend also
    # validates this, but the server is the source of truth. Bump higher
    # (12+) if you can tolerate the UX cost.
    new_password: str = Field(..., min_length=8, max_length=128)
