from sqlalchemy.orm import Session
from sqlalchemy import any_
from datetime import datetime
from app.utils.time import local_now

from app.models.user import User
from app.models.organization import Hospital
from app.schemas.user import UserCreate, UserUpdate

from app.core.security import get_password_hash


# 1. เพิ่มฟังก์ชันดึง User ทีละคน
def get_user(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()


# 2. ปรับฟังก์ชันดึง User หลายคน (เอาอันที่รองรับ Role ไว้แค่อันเดียวพอ)
def get_users(db: Session, role: str = None, status: bool = True):
    query = db.query(User).filter(User.status == status)

    # 🌟 ถ้ามีการส่ง role มา ให้กรองคนที่มี role นั้นอยู่ในอาเรย์ roles
    if role:
        query = query.filter(role == any_(User.roles))

    return query.all()


def create_user(db: Session, data: UserCreate):
    # 1. แปลงข้อมูลจาก Pydantic เป็น Dictionary
    user_data = data.dict()

    # 2. เอา plain text password ออกมาเพื่อ Hash
    plain_password = user_data.pop("password")

    # 🚩 3. ป้องกันการส่งค่าซ้ำ: ดึงค่า is_temporary_password ออกจาก dict (ถ้ามี)
    # เพื่อให้ค่าที่เราจะใส่ข้างล่าง (True) เป็นค่าเดียวที่ถูกส่งไป
    user_data.pop("is_temporary_password", None)

    # hospital_ids is a relationship, not a plain column — set separately below
    hospital_ids = user_data.pop("hospital_ids", [])

    # 4. สร้าง User Object
    new_user = User(
        **user_data,
        hashed_password=get_password_hash(plain_password),
        is_temporary_password=True  # ยืนยันให้เป็น True เสมอที่นี่
    )
    if hospital_ids:
        new_user.hospitals = db.query(Hospital).filter(Hospital.id.in_(hospital_ids)).all()

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


def update_user(db: Session, user_id: int, data: UserUpdate):
    user = get_user(db, user_id)
    if not user:
        return None

    # ดึงเฉพาะข้อมูลที่มีการส่งมาแก้ไข (exclude_unset=True)
    update_data = data.dict(exclude_unset=True)

    # ✅ ตรวจสอบว่ามีการแก้ไข Password หรือไม่
    if "password" in update_data:
        plain_password = update_data.pop("password")
        # ถ้ามี ให้ Hash ใหม่ แล้วเก็บลง field hashed_password
        setattr(user, "hashed_password", get_password_hash(plain_password))
        # 🚩 ถ้า Admin เป็นคนเปลี่ยนรหัสให้ ให้บังคับเปลี่ยนรหัสใหม่เสมอ (เซตกลับเป็น True)
        user.is_temporary_password = True

    # hospital_ids is a relationship, not a plain column — set separately
    if "hospital_ids" in update_data:
        hospital_ids = update_data.pop("hospital_ids") or []
        user.hospitals = db.query(Hospital).filter(Hospital.id.in_(hospital_ids)).all()

    # อัปเดตข้อมูลอื่นๆ ที่เหลือ
    for key, value in update_data.items():
        setattr(user, key, value)

    user.updated_at = local_now()
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int):
    user = get_user(db, user_id)
    if not user:
        return None

    db.delete(user)
    db.commit()
    return True


def update_user_password(db: Session, user_id: int, new_password: str):
    """
    อัปเดต hashed_password และ timestamp last_update_password
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    # 1. Hash รหัสผ่านใหม่
    hashed_password = get_password_hash(new_password)

    # 2. อัปเดต Model
    user.hashed_password = hashed_password

    # 🚩 สำคัญ: เมื่อผู้ใช้เปลี่ยนเองแล้ว ให้เปลี่ยนสถานะเป็น False ทันที
    user.is_temporary_password = False
    user.last_update_password = local_now()  # ✅ ตั้งค่า timestamp ปัจจุบัน
    user.updated_at = local_now()

    db.commit()
    db.refresh(user)
    return user
