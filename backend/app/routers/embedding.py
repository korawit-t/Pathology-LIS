# app/routers/embedding.py
from app.schemas.surgical_block import SurgicalBlockResponse
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List  # 👈 ต้องมีตัวนี้ เพื่อใช้ List[EmbeddingRunResponse]
from app.db.database import get_db
from app.crud import embedding as crud
from app.models.surgical_block import SurgicalBlock
from app.schemas.embedding import (
    EmbeddingRunResponse,
    ScanBlockRequest,
    EmbeddingDetailResponse,
    EmbeddingRunCreate
)
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/embedding",
    tags=["Embedding"],
    dependencies=[Depends(get_current_user)],
)

@router.get("/runs", response_model=List[EmbeddingRunResponse]) # ✅ ตรวจสอบว่าเป็น GET
def read_embedding_runs(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """ดึงรายการรอบการหล่อบล็อกทั้งหมด (History)"""
    return crud.get_embedding_runs(db, skip=skip, limit=limit)

@router.post("/runs", response_model=EmbeddingRunResponse)
def start_new_run(payload: EmbeddingRunCreate, db: Session = Depends(get_db)):
    """สร้างรอบการหล่อบล็อกใหม่ และ Gen Run No. อัตโนมัติ"""
    return crud.create_embedding_run(db, user_id=payload.user_id)

@router.post("/scan", response_model=EmbeddingDetailResponse)
def scan_block_to_run(payload: ScanBlockRequest, db: Session = Depends(get_db)):
    """สแกนตลับเนื้อเข้าสู่รอบการหล่อบล็อก"""
    block = db.query(SurgicalBlock).filter(SurgicalBlock.block_no == payload.block_no).first()
    
    if not block:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลตลับเนื้อนี้")
    
    if block.status == "embedded":
        raise HTTPException(status_code=400, detail="ตลับเนื้อนี้ถูกหล่อบล็อกไปแล้ว")

    return crud.add_block_to_embedding(db, run_id=payload.run_id, block_id=block.id)

@router.get("/pending-blocks", response_model=List[SurgicalBlockResponse]) # สมมติว่ามี Schema นี้
def read_pending_blocks(db: Session = Depends(get_db)):
    return crud.get_pending_blocks(db)

@router.post("/batch-add")
def batch_add_blocks(payload: dict, db: Session = Depends(get_db)):
    # payload: { "run_id": 1, "block_ids": [10, 11, 12] }
    return crud.add_multiple_blocks_to_embedding(
        db, run_id=payload["run_id"], block_ids=payload["block_ids"]
    )

@router.get("/pending-tree", response_model=List[dict])
def get_pending_tree(db: Session = Depends(get_db)):
    """ดึงรายการค้างแบบ Tree (Case > Blocks)"""
    return crud.get_embedding_pending_tree(db)

@router.delete("/runs/{run_id}")
def cancel_embedding_run(run_id: int, db: Session = Depends(get_db)):
    success = crud.delete_empty_embedding_run(db, run_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete run that has scanned blocks")
    return {"message": "Run cancelled and deleted"}