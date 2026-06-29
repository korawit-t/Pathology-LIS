from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.schemas.user import UserCreate, UserUpdate, UserResponse, PasswordUpdate
from app.crud.user import get_users, get_user, create_user, update_user, delete_user
import app.crud.user as user_crud

# ✅ Import RoleChecker และ get_current_user เข้ามา
from app.dependencies.auth import get_current_user, RoleChecker, check_password_status
from app.models.user import User
from app.core.roles import CAN_MANAGE_USERS
from app.core.security import verify_password


router = APIRouter(prefix="/users", tags=["Users"])


# 1. ดูข้อมูลตัวเอง (ใคร Login มา ก็เห็นแค่คนนั้น)
@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user


# 2. ดู Users ทั้งหมด
# 🔒 ปรับสิทธิ์: จาก Admin เท่านั้น เป็น ผู้ใช้งานที่ Login แล้วทุกคน
@router.get("", response_model=list[UserResponse])
def read_all_users(
    role: Optional[str] = None,  # 🌟 รับ role จาก query string เช่น ?role=pathologist
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # 🔒 เช็คแค่ว่า Login หรือยัง
):
    # ส่งค่า role ต่อไปที่ CRUD ที่เราเพิ่งแก้ไป
    return get_users(db, role=role)


# 3. ดู User ตาม ID (🔒 จำกัดสิทธิ์: Admin เท่านั้น)
@router.get(
    "/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(check_password_status), Depends(CAN_MANAGE_USERS)],
)
def read_user_by_id(user_id: int, db: Session = Depends(get_db)):
    user = get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# 4. สร้าง User ใหม่ (🔒 จำกัดสิทธิ์: Admin เท่านั้น)
@router.post(
    "",
    response_model=UserResponse,
    dependencies=[Depends(check_password_status), Depends(CAN_MANAGE_USERS)],
)
def create_new_user(data: UserCreate, db: Session = Depends(get_db)):
    # (Optional) ตรงนี้คุณอาจจะอยากเช็คว่า email ซ้ำไหมก่อน create
    return create_user(db, data)


# 5. แก้ไข User (🔒 จำกัดสิทธิ์: Admin เท่านั้น)
@router.put(
    "/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(check_password_status), Depends(CAN_MANAGE_USERS)],
)
def update_existing_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    updated = update_user(db, user_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


# 6. ลบ User (🔒 จำกัดสิทธิ์: Admin เท่านั้น)
@router.delete(
    "/{user_id}",
    dependencies=[Depends(check_password_status), Depends(CAN_MANAGE_USERS)],
)
def delete_existing_user(user_id: int, db: Session = Depends(get_db)):
    deleted = delete_user(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def update_my_password(
    data: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ยืนยันตัวตนจาก Token
):
    """
    Endpoint สำหรับผู้ใช้งานปัจจุบันตั้งรหัสผ่านใหม่ (ใช้สำหรับ Force Change Password)

    🔒 SECURITY: rejects no-op changes so a user can't "change" a temporary
    password to itself and silently clear the is_temporary_password flag.
    Note: this endpoint does NOT verify the current password — that is
    acceptable for the force-change flow (the user just authenticated) but
    a follow-up improvement is to require the current password for normal
    user-initiated changes.
    """
    from app.models.system_setting import SystemSetting
    settings = db.query(SystemSetting).first()
    min_length = (settings.password_min_length or 8) if settings else 8
    if len(data.new_password) < min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {min_length} characters.",
        )

    if verify_password(data.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )

    updated_user = user_crud.update_user_password(
        db=db,
        user_id=current_user.id,  # ใช้ ID ของ user ที่มาจาก Token
        new_password=data.new_password,
    )

    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")

    # HTTP 204 No Content หมายถึงสำเร็จแต่ไม่ต้องส่ง Body กลับไป
    return


from sqlalchemy.orm.attributes import flag_modified

from fastapi import Body

@router.patch("/me/preferences")
def update_my_preferences(
    prefs: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ปรับปรุงเฉพาะส่วนที่ส่งมา (Merge JSON)
    current_prefs = current_user.preferences or {}
    new_prefs = {**current_prefs, **prefs}
    current_user.preferences = new_prefs
    flag_modified(current_user, "preferences")
    db.commit()
    db.refresh(current_user)
    return {"status": "success", "preferences": current_user.preferences}
