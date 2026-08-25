from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas.surgical_block import (
    SurgicalBlockCreate,
    SurgicalBlockUpdate,
    SurgicalBlockResponse,
    BlockPaginationResponse,
    InternalStainCasePage,
)
from app.crud.surgical_block import (
    create_block,
    list_blocks,
    list_internal_stain_cases,
    update_block,
    delete_block,
)
from app.core.roles import CAN_ACCESS_SURGICAL_BLOCK

router = APIRouter(
    prefix="/surgical-blocks",
    tags=["Surgical Blocks"],
    dependencies=[Depends(CAN_ACCESS_SURGICAL_BLOCK)],
)


# --- Create ---
@router.post("", response_model=SurgicalBlockResponse)
def create_surgical_block(data: SurgicalBlockCreate, db: Session = Depends(get_db)):
    return create_block(db, data)


# --- List All ---
@router.get(
    "", response_model=BlockPaginationResponse
)  # 🌟 แก้จาก List[SurgicalBlockResponse]
def list_all_blocks(
    specimen_id: int = None,
    is_decal: bool = None,
    is_fixing: bool = None,
    decal_history: bool = None,
    fix_history: bool = None,
    has_pending_outlab: bool = None,
    has_internal_stain: bool = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    return list_blocks(db, specimen_id=specimen_id, is_decal=is_decal, is_fixing=is_fixing, decal_history=decal_history, fix_history=fix_history, has_pending_outlab=has_pending_outlab, has_internal_stain=has_internal_stain, skip=skip, limit=limit)


# --- Internal Stain Orders worklist (paginated by case, not by block) ---
@router.get("/internal-stain-cases", response_model=InternalStainCasePage)
def list_internal_stain_case_page(
    search: str = None,
    bucket: str = Query("all", pattern="^(all|pending|completed|recut)$"),
    skip: int = 0,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return list_internal_stain_cases(db, search=search, bucket=bucket, skip=skip, limit=limit)


# --- Update ---
@router.put("/{block_id}", response_model=SurgicalBlockResponse)
def update_surgical_block(
    block_id: int, data: SurgicalBlockUpdate, db: Session = Depends(get_db)
):
    return update_block(db, block_id, data)


# --- Delete ---
@router.delete("/{block_id}")
def delete_surgical_block(
    block_id: int,
    db: Session = Depends(get_db),
):
    return delete_block(db, block_id)


# --- Stain Summary ---
@router.get(
    "/stain-summary", response_model=BlockPaginationResponse
)  # 🌟 แก้ให้เป็น Pagination เหมือนกัน
def get_stain_summary(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    # ปรับปรุงให้ใช้ CRUD list_blocks เพื่อความปลอดภัยและรวดเร็ว
    return list_blocks(db, skip=skip, limit=limit)
