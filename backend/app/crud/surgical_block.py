import logging
from sqlalchemy.orm import Session, joinedload, selectinload
from fastapi import HTTPException
from typing import List
from datetime import datetime
from app.models.surgical_block import SurgicalBlock

logger = logging.getLogger(__name__)

# ตรวจสอบให้แน่ใจว่าใน models.surgical_block_stain ชื่อ Class คือ SurgicalBlockStain
from app.models.surgical_block_stain import SurgicalBlockStain
from app.schemas.surgical_block import (
    SurgicalBlockCreate,
    SurgicalBlockUpdate,
)
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.anatomical_pathology_test import AnatomicalPathologyTest


def create_block(db: Session, obj_in: SurgicalBlockCreate):
    # 1. เช็ค Block เดิม (Logic เดิมของคุณดีอยู่แล้ว)
    existing = (
        db.query(SurgicalBlock)
        .filter(
            SurgicalBlock.specimen_id == obj_in.specimen_id,
            SurgicalBlock.block_no == obj_in.block_no,
        )
        .with_for_update()
        .first()
    )

    if existing:
        return existing

    try:
        # 2. สร้าง Block ใหม่
        db_block = SurgicalBlock(**obj_in.model_dump())
        db.add(db_block)
        db.flush()

        # 3. 🚩 ปรับปรุง: สร้าง H&E ใบแรกอัตโนมัติ โดยอ้างอิงจาก Master Data
        # ค้นหาด้วย system_code แทนการเขียนชื่อ "H&E" ตรงๆ
        he_test = (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.system_code == "HE_ROUTINE")
            .first()
        )

        if he_test:
            first_stain = SurgicalBlockStain(
                block_id=db_block.id,
                test_id=he_test.id,  # 👈 ใช้ ForeignKey แทน String
                slide_no=1,
                status="pending",
            )
            db.add(first_stain)
        else:
            # Fallback กรณีหาในระบบไม่เจอ (อาจจะ log ไว้ หรือ raise error)
            logger.warning("System Default H&E not found in Master Data — block created without initial stain")

        db.commit()
        db.refresh(db_block)
        return db_block
    except Exception as e:
        db.rollback()
        raise e


def get_block(db: Session, block_id: int):
    # ✅ Optimized: โหลด specimen มาพร้อมกันทันที (เพื่อใช้ specimen_label)
    # และโหลด stains ทั้งหมดมาด้วยใน Query เดียว
    block = (
        db.query(SurgicalBlock)
        .options(
            joinedload(
                SurgicalBlock.specimen
            ),  # ใช้ joinedload เพราะ 1 block มี 1 specimen (Many-to-One)
            selectinload(
                SurgicalBlock.stains
            ).selectinload(SurgicalBlockStain.stained_by),  # ใช้ selectinload เพราะ 1 block มีหลาย stains (One-to-Many)
        )
        .filter(SurgicalBlock.id == block_id)
        .first()
    )

    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


def list_blocks(db: Session, specimen_id: int = None, is_decal: bool = None, is_fixing: bool = None, decal_history: bool = None, fix_history: bool = None, skip: int = 0, limit: int = 20):
    # 1. เตรียม Base Query (ยังไม่ต้องยิงคำสั่งไปที่ DB)
    query = db.query(SurgicalBlock)

    # 2. กรองข้อมูลตามเงื่อนไข (ถ้ามี)
    if specimen_id is not None:
        query = query.filter(SurgicalBlock.specimen_id == specimen_id)

    if is_decal is not None:
        query = query.filter(SurgicalBlock.is_decal == is_decal)

    if is_fixing is not None:
        query = query.filter(SurgicalBlock.is_fixing == is_fixing)

    if fix_history is True:
        query = query.filter(SurgicalBlock.fix_end_at.isnot(None)).order_by(SurgicalBlock.fix_end_at.desc())

    if decal_history is True:
        query = query.filter(SurgicalBlock.decal_end_at.isnot(None)).order_by(SurgicalBlock.decal_end_at.desc())

    # specimen_id queries are small — return all without pagination
    if specimen_id is not None and is_decal is None and is_fixing is None:
        items = (
            query.options(
                joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case),
                selectinload(SurgicalBlock.stains).selectinload(SurgicalBlockStain.stained_by),
            )
            .order_by(SurgicalBlock.block_no.asc())
            .all()
        )
        return {"items": items, "total": len(items)}

    # 3. กรณีดึงภาพรวม (Dashboard/Report) ที่อาจมีเป็นแสนแถว 🌟
    # --- นับจำนวนทั้งหมดก่อน (ต้องทำก่อนใส่ offset/limit) ---
    total = query.count()

    # --- ดึงข้อมูลแค่ตามจำนวน limit/skip ที่กำหนด ---
    items = (
        query.options(
            joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case),
            selectinload(SurgicalBlock.stains),
        )
        .order_by(SurgicalBlock.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # 4. ส่งกลับแบบโครงสร้างมาตรฐานที่ Frontend ชอบ
    return {"items": items, "total": total}


def update_block(db: Session, block_id: int, data: SurgicalBlockUpdate):
    block = get_block(db, block_id)
    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(block, field, value)

    db.commit()
    db.refresh(block)
    return block


def delete_block(db: Session, block_id: int):
    block = get_block(db, block_id)
    specimen_id = block.specimen_id
    deleted_no = block.block_no

    db.delete(block)
    db.flush()

    # Renumber all subsequent blocks in ascending order so the unique
    # constraint on (specimen_id, block_no) is never violated mid-flush
    later_blocks = (
        db.query(SurgicalBlock)
        .filter(
            SurgicalBlock.specimen_id == specimen_id,
            SurgicalBlock.block_no > deleted_no,
        )
        .order_by(SurgicalBlock.block_no.asc())
        .all()
    )
    for b in later_blocks:
        b.block_no = b.block_no - 1

    db.commit()
    return {"message": "Block deleted"}
