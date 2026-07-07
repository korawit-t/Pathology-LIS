from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db

# 🚩 อัปเดตการ Import Schema ให้ตรงกับโครงสร้างใหม่
from app.schemas.slide_dispatch import (
    SlideDispatchBulkCreate,
    SlideDispatchPagination,
    SlideDispatchRunResponse,  # ใช้ตัวนี้แทน SlideDispatchResponse ในบางจุด
)
from app.crud import slide_dispatch as crud
from app.models.user import User
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/slide-dispatches",
    tags=["Slide Dispatch"],
    dependencies=[Depends(get_current_user)],
)

# --- 1. Endpoint สำหรับระบบ Scan บาร์โค้ด ---


@router.get("/verify/{accession_no}")
async def verify_accession(
    accession_no: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.verify_accession_for_dispatch(db, accession_no=accession_no)


@router.post(
    "/bulk", response_model=SlideDispatchRunResponse
)  # 🚩 เปลี่ยนจาก List เป็น RunResponse ตัวเดียว
async def dispatch_slide_bulk(
    obj_in: SlideDispatchBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    บันทึกการส่งสไลด์แบบกลุ่ม: สร้าง 1 Run และหลาย Items
    """
    return crud.create_bulk_slide_dispatch(
        db=db, obj_in=obj_in, sender_id=current_user.id
    )


# --- 2. Endpoint สำหรับดึงประวัติ (หน้า List) ---


@router.get("", response_model=SlideDispatchPagination)
async def read_dispatches(
    skip: int = 0,
    limit: int = 15,
    pathologist_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    ดึงรายการใบส่งสไลด์ (Runs) พร้อม Pagination
    """
    return crud.get_slide_dispatches(db, skip=skip, limit=limit, pathologist_id=pathologist_id)


# --- 3. ยกเลิกการส่ง ---


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_dispatch(
    run_id: int,  # 🚩 เปลี่ยนจาก dispatch_id เป็น run_id เพื่อให้ลบทั้งใบ
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ฟังก์ชันนี้ใน CRUD จะทำการ reset สถานะเคสทั้งหมดในใบนั้นและลบ Header
    success = crud.delete_slide_dispatch(db, run_id)
    if not success:
        raise HTTPException(status_code=404, detail="Slide dispatch run not found")
    return None
