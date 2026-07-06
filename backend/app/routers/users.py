from fastapi import APIRouter, Depends, HTTPException, Request, status
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
from app.routers.auth import limiter


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


# 4. สร้าง User ใหม่ (🔒 จำกัดสิทธิ์: Admin และ Lab Manager)
@router.post(
    "",
    response_model=UserResponse,
    dependencies=[Depends(check_password_status)],
)
def create_new_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_MANAGE_USERS),
):
    # 🔒 Lab manager สร้าง user ใหม่ได้ แต่ห้ามตั้ง role admin ให้ user ใหม่
    if "admin" in data.roles and "admin" not in current_user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an admin can grant the admin role.",
        )
    # (Optional) ตรงนี้คุณอาจจะอยากเช็คว่า email ซ้ำไหมก่อน create
    return create_user(db, data)


# 5. แก้ไข User (🔒 จำกัดสิทธิ์: Admin และ Lab Manager แต่ห้ามแก้ไข account admin)
@router.put(
    "/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(check_password_status)],
)
def update_existing_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_MANAGE_USERS),
):
    target_user = get_user(db, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # 🔒 ป้องกัน lab_manager แก้ไข/เปลี่ยนรหัสผ่านของ account admin
    # หรือเลื่อนสิทธิ์ตัวเอง/คนอื่นให้เป็น admin
    if "admin" not in current_user.roles:
        if "admin" in (target_user.roles or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an admin can modify an admin account.",
            )
        if data.roles is not None and "admin" in data.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only an admin can grant the admin role.",
            )

    updated = update_user(db, user_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


# 6. ลบ User (🔒 จำกัดสิทธิ์: Admin และ Lab Manager แต่ห้ามลบ account admin)
@router.delete(
    "/{user_id}",
    dependencies=[Depends(check_password_status)],
)
def delete_existing_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(CAN_MANAGE_USERS),
):
    target_user = get_user(db, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if "admin" in (target_user.roles or []) and "admin" not in current_user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an admin can delete an admin account.",
        )

    deleted = delete_user(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted successfully"}


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def update_my_password(
    request: Request,
    data: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ยืนยันตัวตนจาก Token
):
    """
    Endpoint สำหรับผู้ใช้งานปัจจุบันตั้งรหัสผ่านใหม่ (ใช้สำหรับ Force Change Password)

    🔒 SECURITY: rejects no-op changes so a user can't "change" a temporary
    password to itself and silently clear the is_temporary_password flag.
    Also requires the caller's current password, so a hijacked session
    (stolen cookie, unlocked device) can't take over the account by
    silently setting a new password.
    """
    if not verify_password(data.current_password, current_user.hashed_password):
        # 400, not 401: the caller IS authenticated, they just supplied the
        # wrong current password. A 401 here would trip httpClient.tsx's
        # global interceptor into attempting a silent token refresh + retry.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

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
