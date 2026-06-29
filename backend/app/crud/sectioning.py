from sqlalchemy.orm import Session, joinedload, contains_eager
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy import desc, not_, select
from app.models.sectioning import SectioningRun, SectioningDetail
from app.schemas.sectioning import (
    SectioningRunCreate,
    SectioningDetailCreate,
    SectioningDetailUpdate,
    SectioningRunCreateBatch,
)
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_case import SurgicalCase
from app.schemas import sectioning as schemas
from datetime import datetime
from app.utils.time import local_now


def _promote_cases_if_fully_sectioned(db: Session, block_ids: list[int]) -> None:
    """After flushing block status updates, promote any fully-sectioned case to 'sectioned'."""
    blocks = (
        db.query(SurgicalBlock)
        .options(joinedload(SurgicalBlock.specimen))
        .filter(SurgicalBlock.id.in_(block_ids))
        .all()
    )
    case_ids = {b.specimen.case_id for b in blocks if b.specimen}
    for case_id in case_ids:
        not_sectioned = (
            db.query(SurgicalBlock)
            .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
            .filter(
                SurgicalSpecimen.case_id == case_id,
                SurgicalBlock.status != "sectioned",
            )
            .count()
        )
        if not_sectioned == 0:
            case = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()
            if case:
                case.status = "sectioned"


def generate_sectioning_run_number(db: Session):
    """
    สร้างรหัสรันอัตโนมัติ Format: SR-YYYYMMDD-XXX
    """
    # 1. ใช้ timezone ที่แน่นอน (ถ้าเป็นไปได้) หรือใช้ local_now()
    today_str = local_now().strftime("%Y%m%d")
    prefix = f"SR-{today_str}"

    # 2. ดึงเลขล่าสุด (ใช้ desc() เพื่อเอาเลขที่ใหญ่ที่สุด)
    last_run = (
        db.query(SectioningRun)
        .filter(SectioningRun.run_no.like(f"{prefix}%"))
        .order_by(SectioningRun.run_no.desc())
        .first()
    )

    # 3. กรณีเป็นรายการแรกของวัน
    if not last_run:
        return f"{prefix}-001"

    try:
        # 4. แยกเลข Sequence (SR-20251230-001 -> 001)
        # ใช้ split("-")[-1] เพื่อความยืดหยุ่นถ้า prefix มีขีดเยอะ
        last_seq_str = last_run.run_no.split("-")[-1]
        new_seq = int(last_seq_str) + 1

        # 5. คืนค่าพร้อม Format เลข 3 หลัก (001, 002, ...)
        return f"{prefix}-{new_seq:03d}"
    except (ValueError, IndexError):
        # กรณีรหัสเดิมผิด Format ให้เริ่ม 001 ใหม่เพื่อไม่ให้ระบบพัง
        return f"{prefix}-001"


def create_sectioning_run_batch(db: Session, obj_in: SectioningRunCreateBatch):
    # 1. เจนเลขรันจังหวะนี้เลย (จังหวะที่กด Finish จากหน้าจอ)
    auto_run_no = generate_sectioning_run_number(
        db
    )  # ฟังก์ชันเดิมที่คุณใช้เจนเลข SR-YYYYMMDD-XX

    # 2. สร้าง Header Run
    db_run = SectioningRun(
        run_no=auto_run_no,
        user_id=obj_in.user_id,
        microtome_id=obj_in.microtome_id,
        started_at=local_now(),
        finished_at=local_now(),
    )

    try:
        db.add(db_run)
        db.flush()  # จอง ID ของ Run เพื่อเอาไปใช้ใน Detail

        # 3. บันทึกตลับเนื้อทั้งหมดที่ส่งมาจากหน้าจอ
        for item in obj_in.items:
            db_detail = SectioningDetail(
                run_id=db_run.id,
                block_id=item.block_id,
                slide_count=item.slide_count,
                is_recut=item.is_recut,
            )
            db.add(db_detail)

            # 4. อัปเดตสถานะ Block เป็น 'sectioned'
            db.query(SurgicalBlock).filter(SurgicalBlock.id == item.block_id).update(
                {"status": "sectioned"}
            )

        db.flush()

        # 5. Promote case status to 'sectioned' when all blocks in a case are done
        block_ids = [item.block_id for item in obj_in.items]
        _promote_cases_if_fully_sectioned(db, block_ids)

        db.commit()
        db.refresh(db_run)
        return db_run
    except Exception as e:
        db.rollback()
        raise e


# --- Detail Operations ---
def add_sectioning_detail(db: Session, run_id: int, detail_in: SectioningDetailCreate):
    db_obj = SectioningDetail(**detail_in.dict(), run_id=run_id)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


# Update ข้อมูลการตัดสไลด์ในแต่ละตลับ
def update_sectioning_detail(
    db: Session, detail_id: int, obj_in: SectioningDetailUpdate
):
    db_obj = db.query(SectioningDetail).filter(SectioningDetail.id == detail_id).first()
    if not db_obj:
        return None

    update_data = obj_in.dict(exclude_unset=True)
    for field in update_data:
        setattr(db_obj, field, update_data[field])

    db.commit()
    db.refresh(db_obj)
    return db_obj


# กรณีต้องการลบรายการที่สแกนผิด (เช่น สแกนซ้ำ หรือสแกนผิดตลับ)
def delete_sectioning_detail(db: Session, detail_id: int):
    db_obj = db.query(SectioningDetail).filter(SectioningDetail.id == detail_id).first()
    if db_obj:
        db.delete(db_obj)
        db.commit()
        return True
    return False


def get_sectioning_runs(
    db: Session, skip: int = 0, limit: int = 100, active_only: bool = False
):
    query = db.query(SectioningRun)

    if active_only:
        # ดึงเฉพาะ Run ที่ยังไม่ได้กด Finish (finished_at เป็น NULL)
        query = query.filter(SectioningRun.finished_at == None)

    # เรียงลำดับตาม ID ล่าสุดขึ้นก่อน
    return query.order_by(desc(SectioningRun.id)).offset(skip).limit(limit).all()


# เพิ่มฟังก์ชันลบ Run กรณีที่ User กดยกเลิก (ป้องกัน Run ขยะ)
def delete_sectioning_run(db: Session, run_id: int):
    """ลบ Run และ Details ที่เกี่ยวข้อง (Cascading manual)"""
    db_obj = db.query(SectioningRun).filter(SectioningRun.id == run_id).first()
    if db_obj:
        # ลบลูกก่อนเพื่อป้องกัน Foreign Key Error ในบาง DB
        db.query(SectioningDetail).filter(SectioningDetail.run_id == run_id).delete()
        db.delete(db_obj)
        db.commit()
        return True
    return False


def batch_add_sectioning_details(
    db: Session, run_id: int, items: List[SectioningDetailCreate]
):
    db_objs = []
    for item in items:
        # ใช้ .dict() (หรือ .model_dump() ใน Pydantic v2) เพื่อแปลงเป็น dictionary
        db_obj = SectioningDetail(
            **item.dict(), run_id=run_id, sectioned_at=local_now()
        )
        db.add(db_obj)
        db_objs.append(db_obj)

    db.commit()
    # refresh ข้อมูลเพื่อให้ได้ id และ timestamp กลับมา
    for obj in db_objs:
        db.refresh(obj)
    return db_objs


def get_pending_blocks_tree(db: Session):
    """ดึงข้อมูลต้นไม้ของตลับที่รอตัดสไลด์ (จัดกลุ่มตาม Accession)"""
    sectioned_subquery = select(SectioningDetail.block_id)

    # 1. โหลดข้อมูลลึกถึงระดับ Case
    all_blocks = (
        db.query(SurgicalBlock)
        .options(joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case))
        .filter(
            SurgicalBlock.status == "embedded",
            not_(SurgicalBlock.id.in_(sectioned_subquery)),
        )
        .all()
    )

    # 2. จัดกลุ่มตาม Case ID แทน Specimen ID
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
                "code": case_obj.accession_no,  # หัวข้อใหญ่โชว์เลข Accession
                "isCase": True,
                "children": [],
            }

        # เพิ่มตลับเนื้อลงใน Case นี้
        case_map[case_id]["children"].append(
            {
                "key": block.id,
                "id": block.id,
                # แสดงเลข Accession No กำกับที่ตัวลูกด้วยเพื่อความแม่นยำตอนสแกน
                "code": f"{case_obj.accession_no} {block.block_code}",
                "isCase": False,
                "is_decal": getattr(block, "is_decal", False),
            }
        )

    # แปลงเป็น list และเรียงตามเลข Accession
    result = list(case_map.values())
    result.sort(key=lambda x: x["code"])

    return result


def finish_sectioning_run(db: Session, run_id: int):
    db_run = db.query(SectioningRun).filter(SectioningRun.id == run_id).first()
    if not db_run:
        return None

    try:
        db_run.finished_at = local_now()

        # ดึง ID ของตลับทั้งหมดในรอบนี้
        details = (
            db.query(SectioningDetail).filter(SectioningDetail.run_id == run_id).all()
        )
        block_ids = [d.block_id for d in details]

        if block_ids:
            # 1. Mark all blocks in this run as sectioned
            db.query(SurgicalBlock).filter(SurgicalBlock.id.in_(block_ids)).update(
                {"status": "sectioned"}, synchronize_session=False
            )

            db.flush()

            # 2. Promote case to 'sectioned' when all its blocks are done
            _promote_cases_if_fully_sectioned(db, block_ids)

        db.commit()
        db.refresh(db_run)
        return db_run
    except Exception as e:
        db.rollback()
        raise e


def get_sectioning_run_detail(db: Session, run_id: int):
    return (
        db.query(SectioningRun)
        .options(
            joinedload(SectioningRun.details)
            .joinedload(SectioningDetail.block)  # <--- หัวใจสำคัญคือบรรทัดนี้
            .joinedload(SurgicalBlock.specimen)
        )
        .filter(SectioningRun.id == run_id)
        .first()
    )
