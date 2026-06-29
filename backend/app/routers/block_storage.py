from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.crud import block_storage as crud
from app.schemas import block_storage as schemas
from app.dependencies.auth import get_current_user
from app.models.user import User

router = APIRouter(
    prefix="/block-storage",
    tags=["Block Storage"],
    dependencies=[Depends(get_current_user)],
)

@router.get("/pending-tree")
def read_pending_blocks_tree(db: Session = Depends(get_db)):
    """
    ดึงรายการตลับเนื้อรอจัดเก็บ
    จัดกลุ่มตาม Case -> Specimen -> Block
    """
    return crud.get_pending_storage_blocks_tree(db)

@router.post("/batch", response_model=schemas.BlockStorageRun)
def create_block_storage_batch(
    payload: schemas.BlockStorageRunCreateBatch,
    db: Session = Depends(get_db)
):
    """
    บันทึกการจัดเก็บแบบทีละหลายตลับ (Batch Storage)
    """
    try:
        run = crud.create_block_storage_run_batch(db, obj_in=payload)
        return run
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ไม่สามารถบันทึกรอบการจัดเก็บได้: {str(e)}"
        )

@router.get("/search", response_model=List[schemas.BlockStorageRun])
def search_block_storage_by_accession(
    accession_no: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Find storage runs that contain blocks for the given accession number."""
    return crud.search_runs_by_accession(db, accession_no)


@router.get("/runs", response_model=List[schemas.BlockStorageRun])
def read_block_storage_runs(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
    """
    ดึงรายการประวัติการจัดเก็บ
    """
    runs = crud.get_block_storage_runs(db, skip=skip, limit=limit)
    return runs

@router.get("/runs/{run_id}", response_model=schemas.BlockStorageRun)
def read_block_storage_run(
    run_id: int, db: Session = Depends(get_db)
):
    """
    ดึงรายละเอียดของรอบการจัดเก็บ (รวมถึงรายการตลับที่เก็บในรอบนี้)
    """
    run = crud.get_block_storage_run_detail(db, run_id=run_id)
    if not run:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลรอบการจัดเก็บ")
    return run

@router.get("/stored-blocks", response_model=dict)
def read_stored_block_details(
    skip: int = 0,
    limit: int = 50,
    search: str = Query(""),
    db: Session = Depends(get_db),
):
    items, total = crud.get_stored_block_details(db, skip=skip, limit=limit, search=search)
    return {"items": [schemas.BlockStorageDetail.model_validate(r) for r in items], "total": total}

@router.get("/disposed-blocks", response_model=dict)
def read_disposed_block_details(
    skip: int = 0,
    limit: int = 50,
    search: str = Query(""),
    db: Session = Depends(get_db),
):
    items, total = crud.get_disposed_block_details(db, skip=skip, limit=limit, search=search)
    return {"items": [schemas.BlockStorageDetail.model_validate(r) for r in items], "total": total}

@router.post("/dispose-blocks", response_model=List[schemas.BlockStorageDetail])
def dispose_blocks(
    payload: schemas.BlockDisposeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.dispose_block_details(db, detail_ids=payload.detail_ids, user_id=current_user.id)

@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_block_storage_run(
    run_id: int, db: Session = Depends(get_db)
):
    """
    ลบรอบการจัดเก็บ 
    *** ข้อควรระวัง: สำหรับกรณีฉุกเฉิน หรือทดสอบระบบ ***
    """
    success = crud.delete_block_storage_run(db, run_id=run_id)
    if not success:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลรอบการจัดเก็บ")
    return None
