from sqlalchemy.orm import Session, joinedload, contains_eager
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy import desc, not_, select, func
from app.models.block_storage import BlockStorageRun, BlockStorageDetail
from app.schemas.block_storage import (
    BlockStorageRunCreateBatch,
    BlockStorageDetailCreate,
)
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_specimen import SurgicalSpecimen
from datetime import datetime
from app.utils.time import local_now

def generate_block_storage_run_number(db: Session):
    """
    สร้างรหัสรันอัตโนมัติ Format: STORE-YYYYMMDD-XXX
    """
    today_str = local_now().strftime("%Y%m%d")
    prefix = f"STORE-{today_str}"

    last_run = (
        db.query(BlockStorageRun)
        .filter(BlockStorageRun.run_no.like(f"{prefix}%"))
        .order_by(BlockStorageRun.run_no.desc())
        .first()
    )

    if not last_run:
        return f"{prefix}-001"

    try:
        last_seq_str = last_run.run_no.split("-")[-1]
        new_seq = int(last_seq_str) + 1
        return f"{prefix}-{new_seq:03d}"
    except (ValueError, IndexError):
        return f"{prefix}-001"

def get_pending_storage_blocks_tree(db: Session):
    """ดึงข้อมูลต้นไม้ของตลับที่รอจัดเก็บ (จัดกลุ่มตาม Accession)
       เงื่อนไข: ตลับที่ผ่านการ sectioned หรือ stained แล้วยังไม่จัดเก็บ
    """
    # blocks that are already stored shouldn't be here, but if they are 
    # marked with status 'stored' we can filter them out.
    # From sectioning.py, block status becomes 'sectioned' when cut.
    # It might become 'stained' after staining. We can look for both.
    
    stored_subquery = select(BlockStorageDetail.block_id)

    all_blocks = (
        db.query(SurgicalBlock)
        .options(joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case))
        .filter(
            SurgicalBlock.status.in_(["sectioned", "stained"]),
            not_(SurgicalBlock.id.in_(stored_subquery)),
        )
        .all()
    )

    case_map = {}
    for block in all_blocks:
        spec_obj = block.specimen
        if not spec_obj or not spec_obj.case:
            continue

        case_obj = spec_obj.case
        case_id = case_obj.id

        if case_id not in case_map:
            case_map[case_id] = {
                "key": f"case-{case_id}",
                "id": case_id,
                "code": case_obj.accession_no,
                "isCase": True,
                "children": [],
            }

        case_map[case_id]["children"].append(
            {
                "key": block.id,
                "id": block.id,
                "code": f"{case_obj.accession_no} {block.block_code}",
                "isCase": False,
                "is_decal": getattr(block, "is_decal", False),
            }
        )

    result = list(case_map.values())
    result.sort(key=lambda x: x["code"])

    return result

def create_block_storage_run_batch(db: Session, obj_in: BlockStorageRunCreateBatch):
    auto_run_no = generate_block_storage_run_number(db)

    db_run = BlockStorageRun(
        run_no=auto_run_no,
        user_id=obj_in.user_id,
        started_at=local_now(),
        finished_at=local_now(),
        remark=obj_in.remark
    )

    try:
        db.add(db_run)
        db.flush() 

        for item in obj_in.items:
            db_detail = BlockStorageDetail(
                run_id=db_run.id,
                block_id=item.block_id,
                storage_location=item.storage_location,
                remark=item.remark,
            )
            db.add(db_detail)

            # อัปเดตสถานะ Block เป็น 'stored'
            db.query(SurgicalBlock).filter(SurgicalBlock.id == item.block_id).update(
                {"status": "stored"}
            )

        db.commit()
        db.refresh(db_run)
        return db_run
    except Exception as e:
        db.rollback()
        raise e

def search_runs_by_accession(db: Session, accession_no: str):
    """Find all storage runs that contain blocks belonging to the given accession number."""
    from app.models.surgical_case import SurgicalCase

    runs = (
        db.query(BlockStorageRun)
        .join(BlockStorageRun.details)
        .join(BlockStorageDetail.block)
        .join(SurgicalBlock.specimen)
        .join(SurgicalSpecimen.case)
        .filter(SurgicalCase.accession_no.ilike(f"%{accession_no}%"))
        .options(
            joinedload(BlockStorageRun.details)
            .joinedload(BlockStorageDetail.block)
            .joinedload(SurgicalBlock.specimen)
        )
        .distinct()
        .all()
    )
    return runs


def get_block_storage_runs(db: Session, skip: int = 0, limit: int = 100):
    return db.query(BlockStorageRun).order_by(desc(BlockStorageRun.id)).offset(skip).limit(limit).all()

def get_block_storage_run_detail(db: Session, run_id: int):
    return (
        db.query(BlockStorageRun)
        .options(
            joinedload(BlockStorageRun.details)
            .joinedload(BlockStorageDetail.block)  
            .joinedload(SurgicalBlock.specimen)
        )
        .filter(BlockStorageRun.id == run_id)
        .first() # type: ignore
    )

def _build_detail_query(db: Session, discard: bool, search: str = ""):
    from app.models.surgical_case import SurgicalCase
    q = db.query(BlockStorageDetail).filter(
        BlockStorageDetail.discard_status.is_(discard)
    )
    if search:
        q = (
            q.join(BlockStorageDetail.block)
            .join(SurgicalBlock.specimen)
            .join(SurgicalSpecimen.case)
            .filter(SurgicalCase.accession_no.ilike(f"%{search}%"))
        )
    return q

def get_stored_block_details(db: Session, skip: int = 0, limit: int = 50, search: str = ""):
    q = _build_detail_query(db, discard=False, search=search)
    total = q.count()
    items = (
        q.options(
            joinedload(BlockStorageDetail.block).joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case),
            joinedload(BlockStorageDetail.run),
            joinedload(BlockStorageDetail.discard_by),
        )
        .order_by(BlockStorageDetail.stored_at)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total

def get_disposed_block_details(db: Session, skip: int = 0, limit: int = 50, search: str = ""):
    q = _build_detail_query(db, discard=True, search=search)
    total = q.count()
    items = (
        q.options(
            joinedload(BlockStorageDetail.block).joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case),
            joinedload(BlockStorageDetail.run),
            joinedload(BlockStorageDetail.discard_by),
        )
        .order_by(desc(BlockStorageDetail.discard_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total

def dispose_block_details(db: Session, detail_ids: list, user_id: int):
    now = local_now()
    db.query(BlockStorageDetail).filter(BlockStorageDetail.id.in_(detail_ids)).update(
        {"discard_status": True, "discard_at": now, "discard_by_id": user_id},
        synchronize_session=False,
    )
    db.commit()
    return db.query(BlockStorageDetail).options(
        joinedload(BlockStorageDetail.block),
        joinedload(BlockStorageDetail.run),
    ).filter(BlockStorageDetail.id.in_(detail_ids)).all()

def delete_block_storage_run(db: Session, run_id: int):
    db_obj = db.query(BlockStorageRun).filter(BlockStorageRun.id == run_id).first()
    if db_obj:
        # Before deleting, should we revert block status? 
        # For safety, let's just delete for now and keep it simple.
        details = db.query(BlockStorageDetail).filter(BlockStorageDetail.run_id == run_id).all()
        block_ids = [d.block_id for d in details]
        if block_ids:
            # Revert to 'stained' or 'sectioned' is tricky without history. 
            # We will revert to 'sectioned' as a default if run is deleted to allow re-storing.
            db.query(SurgicalBlock).filter(SurgicalBlock.id.in_(block_ids)).update(
                {"status": "sectioned"}
            )
        
        db.query(BlockStorageDetail).filter(BlockStorageDetail.run_id == run_id).delete()
        db.delete(db_obj)
        db.commit()
        return True
    return False
