from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.schemas.stain_run import StainRunCreate, StainRunResponse, StainRunUpdate
from app.crud import stain_run as crud
from app.dependencies.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/stain-runs", tags=["Stain Runs"])


@router.post("", response_model=StainRunResponse)
def create_run(
    data: StainRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """สร้างรายการ Run ใหม่และผูกสไลด์ที่เลือกเข้ากับ Run นี้"""
    if not data.stain_ids:
        raise HTTPException(status_code=400, detail="At least one slide must be selected")
    return crud.create_stain_run(db, data, user_id=current_user.id)


@router.get("", response_model=List[StainRunResponse])
def list_runs(test_id: int = None, db: Session = Depends(get_db)):  # 🚩 เปลี่ยนชื่อและ Type
    """
    ดึงรายการ Run ทั้งหมด (กรองตาม test_id จาก Master Data ได้)
    """
    return crud.list_active_runs(db, test_id=test_id)


@router.get("/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db)):
    """Return run details with all associated slides."""
    result = crud.get_run_details(db, run_id=run_id)
    if not result:
        raise HTTPException(status_code=404, detail="Run not found.")
    return result


@router.patch("/{run_id}/status")
def update_status(run_id: int, status: str, db: Session = Depends(get_db)):
    """อัปเดตสถานะของ Run (เช่น 'completed' เมื่อย้อมเสร็จ)"""
    updated_run = crud.update_run_status(db, run_id, status)
    if not updated_run:
        raise HTTPException(status_code=404, detail="ไม่พบรายการ Run")
    return updated_run
