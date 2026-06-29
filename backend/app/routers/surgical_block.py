from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.schemas.surgical_block import (
    SurgicalBlockCreate,
    SurgicalBlockUpdate,
    SurgicalBlockResponse,
    BlockPaginationResponse,
)
from app.crud.surgical_block import (
    create_block,
    list_blocks,
    get_block,
    update_block,
    delete_block,
)
from app.models.surgical_block import SurgicalBlock
from app.dependencies.auth import get_current_user, RoleChecker
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
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    return list_blocks(db, specimen_id=specimen_id, is_decal=is_decal, is_fixing=is_fixing, decal_history=decal_history, fix_history=fix_history, skip=skip, limit=limit)


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
