from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.crud import sectioning as crud
from app.schemas import sectioning as schemas
from app.dependencies.auth import get_current_user, RoleChecker
from app.core.roles import CAN_ACCESS_SURGICAL_BLOCK
from app.models.user import User

router = APIRouter(
    prefix="/sectioning",
    tags=["Sectioning"],
    dependencies=[Depends(CAN_ACCESS_SURGICAL_BLOCK)],
)


@router.post("/runs", response_model=schemas.SectioningRun)
def create_run(obj_in: schemas.SectioningRunCreate, db: Session = Depends(get_db)):
    return crud.create_sectioning_run(db=db, obj_in=obj_in)


@router.get("/runs/{run_id}", response_model=schemas.SectioningRun)
def read_run(run_id: int, db: Session = Depends(get_db)):
    db_obj = crud.get_sectioning_run_detail(db, run_id=run_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Run not found")
    return db_obj


@router.post("/runs/{run_id}/details", response_model=schemas.SectioningDetail)
def add_detail(
    run_id: int,
    detail_in: schemas.SectioningDetailCreate,
    db: Session = Depends(get_db),
):
    return crud.add_sectioning_detail(db=db, run_id=run_id, detail_in=detail_in)


@router.put("/runs/{run_id}/finish", response_model=schemas.SectioningRun)
def finish_run(run_id: int, db: Session = Depends(get_db)):
    return crud.finish_sectioning_run(db=db, run_id=run_id)


@router.get("/runs", response_model=List[schemas.SectioningRun])
def read_runs(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    """
    ดึงรายการ Sectioning Runs ทั้งหมด
    - active_only=true: จะแสดงเฉพาะรอบที่ยังตัดไม่เสร็จ
    """
    runs = crud.get_sectioning_runs(db, skip=skip, limit=limit, active_only=active_only)
    return runs


@router.patch("/details/{detail_id}", response_model=schemas.SectioningDetail)
def update_detail(
    detail_id: int,
    obj_in: schemas.SectioningDetailUpdate,
    db: Session = Depends(get_db),
):
    """แก้ไขข้อมูลรายละเอียดการตัดสไลด์ (เช่น แก้จำนวน Slide หรือสถานะ Recut)"""
    db_obj = crud.update_sectioning_detail(db, detail_id=detail_id, obj_in=obj_in)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Detail not found")
    return db_obj


@router.delete("/details/{detail_id}")
def delete_detail(detail_id: int, db: Session = Depends(get_db)):
    """ลบรายการการตัดสไลด์ (กรณีสแกนผิดตลับ หรือสแกนซ้ำ)"""
    success = crud.delete_sectioning_detail(db, detail_id=detail_id)
    if not success:
        raise HTTPException(status_code=404, detail="Detail not found")
    return {"message": "Successfully deleted"}


@router.post(
    "/runs/{run_id}/batch-details", response_model=List[schemas.SectioningDetail]
)
def create_sectioning_batch(
    run_id: int, payload: schemas.SectioningBatchCreate, db: Session = Depends(get_db)
):
    return crud.batch_add_sectioning_details(db, run_id=run_id, items=payload.items)


@router.delete("/runs/{run_id}")
def delete_run(run_id: int, db: Session = Depends(get_db)):
    """ลบรอบการตัด (ยกเลิก)"""
    success = crud.delete_sectioning_run(db, run_id=run_id)
    if not success:
        raise HTTPException(status_code=404, detail="Run not found or cannot delete")
    return {"message": "Successfully deleted run"}


@router.get("/pending-tree")
def get_pending_tree(db: Session = Depends(get_db)):
    """
    ดึงรายการตลับเนื้อที่หล่อบล็อกเสร็จแล้ว (Embedded)
    แต่ยังไม่ได้ทำการตัด (Sectioning) จัดกลุ่มตาม Case
    """
    # เรียกฟังก์ชันจาก CRUD
    data = crud.get_pending_blocks_tree(db)
    return data


@router.post("/batch", response_model=schemas.SectioningRun)
def create_run_batch(
    obj_in: schemas.SectioningRunCreateBatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Endpoint สำหรับสร้างรอบการตัด (Run) และบันทึกรายการสไลด์ (Details)
    พร้อมกันในครั้งเดียว (Batch)
    """
    # Audit integrity: record the acting user from the JWT, never the client body.
    obj_in.user_id = current_user.id
    return crud.create_sectioning_run_batch(db=db, obj_in=obj_in)


@router.get("/runs/{run_id}", response_model=schemas.SectioningRun)
def read_run(run_id: int, db: Session = Depends(get_db)):
    db_obj = crud.get_sectioning_run_detail(db, run_id=run_id)  # CRUD ที่แก้ใหม่จะส่ง Block มาด้วย
    if not db_obj:
        raise HTTPException(status_code=404, detail="Run not found")
    return db_obj
