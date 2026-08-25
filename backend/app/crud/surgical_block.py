import logging
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload
from fastapi import HTTPException
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
from app.models.surgical_case import SurgicalCase
from app.utils.stain_filters import (
    is_in_house_stain,
    is_internal_stain_order,
)

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


def list_blocks(db: Session, specimen_id: int = None, is_decal: bool = None, is_fixing: bool = None, decal_history: bool = None, fix_history: bool = None, has_pending_outlab: bool = None, has_internal_stain: bool = None, skip: int = 0, limit: int = 20):
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

    # Outlab dispatch queue: filter to blocks with at least one pending
    # external-lab stain *before* ordering/limiting, so an old block that just
    # had an IHC added doesn't get truncated out by the "most recent N blocks"
    # window below (see PendingQueueTab — it used to fetch top-200-by-id and
    # filter client-side, which silently dropped older blocks once the lab had
    # created 200+ newer blocks since).
    if has_pending_outlab is True:
        query = (
            query.join(SurgicalBlockStain, SurgicalBlockStain.block_id == SurgicalBlock.id)
            .join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
            .filter(
                SurgicalBlockStain.status == "pending",
                AnatomicalPathologyTest.is_external == True,  # noqa: E712
            )
            .distinct()
        )

    # HosXP Key tab on the Internal Stain page: every block carrying an
    # in-house stain that is a real order — i.e. not the routine H&E that
    # create_block adds to every block, which would otherwise match the whole
    # table. Same reason as has_pending_outlab above: the page used to fetch
    # the newest 200 blocks and filter client-side, so anything older silently
    # vanished. Wider than list_internal_stain_cases below (special stains +
    # recuts) because an in-house IHC still has to be keyed for billing.
    if has_internal_stain is True:
        query = (
            query.join(SurgicalBlockStain, SurgicalBlockStain.block_id == SurgicalBlock.id)
            .outerjoin(
                AnatomicalPathologyTest,
                SurgicalBlockStain.test_id == AnatomicalPathologyTest.id,
            )
            .filter(is_in_house_stain())
            .distinct()
        )

    # specimen_id / has_pending_outlab / has_internal_stain queries are small —
    # return all without pagination
    unpaginated = (
        (specimen_id is not None and is_decal is None and is_fixing is None)
        or has_pending_outlab is True
        or has_internal_stain is True
    )
    if unpaginated:
        # block_no ordering only makes sense for a single specimen; the queue
        # views span every case, so they want newest-first.
        newest_first = has_pending_outlab is True or has_internal_stain is True
        items = (
            query.options(
                joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case),
                selectinload(SurgicalBlock.stains).selectinload(SurgicalBlockStain.stained_by),
                selectinload(SurgicalBlock.stains).joinedload(SurgicalBlockStain.test),
            )
            .order_by(SurgicalBlock.id.desc() if newest_first else SurgicalBlock.block_no.asc())
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


def list_internal_stain_cases(
    db: Session,
    search: str = None,
    bucket: str = "all",
    skip: int = 0,
    limit: int = 20,
):
    """One page of *cases* for the Internal Stain Orders worklist.

    The page groups blocks by accession number, so paginating blocks would cut
    a case in half — the rows have to be counted and sliced per case in SQL,
    then the blocks for the surviving cases fetched in a second query.

    `bucket` mirrors the page's segmented filter: all | pending (has at least
    one pending slide) | completed | recut.
    """
    # Per-case rollup over the stains this page tracks. GROUP BY runs before
    # LIMIT, so a case is either wholly in the page or wholly out of it.
    rollup = (
        db.query(
            SurgicalCase.id.label("case_id"),
            SurgicalCase.accession_no.label("accession_no"),
            func.count(SurgicalBlockStain.id)
            .filter(SurgicalBlockStain.status == "pending")
            .label("pending_count"),
            func.count(SurgicalBlockStain.id)
            .filter(SurgicalBlockStain.status == "stained")
            .label("stained_count"),
            func.count(SurgicalBlockStain.id)
            .filter(SurgicalBlockStain.is_recut.is_(True))
            .label("recut_count"),
        )
        .select_from(SurgicalBlockStain)
        .join(SurgicalBlock, SurgicalBlock.id == SurgicalBlockStain.block_id)
        .join(SurgicalSpecimen, SurgicalSpecimen.id == SurgicalBlock.specimen_id)
        .join(SurgicalCase, SurgicalCase.id == SurgicalSpecimen.case_id)
        .outerjoin(
            AnatomicalPathologyTest,
            AnatomicalPathologyTest.id == SurgicalBlockStain.test_id,
        )
        .filter(is_internal_stain_order())
    )

    if search:
        like = f"%{search}%"
        rollup = rollup.filter(
            or_(
                SurgicalCase.accession_no.ilike(like),
                SurgicalSpecimen.specimen_label.ilike(like),
            )
        )

    sub = rollup.group_by(SurgicalCase.id, SurgicalCase.accession_no).subquery()

    # Segmented labels and the header counters: computed off the searched set
    # but *before* the bucket filter, so every label stays visible.
    totals = db.query(
        func.count().label("all"),
        func.count().filter(sub.c.pending_count > 0).label("pending"),
        func.count().filter(sub.c.pending_count == 0).label("completed"),
        func.count().filter(sub.c.recut_count > 0).label("recut"),
        func.coalesce(func.sum(sub.c.pending_count), 0).label("pending_slides"),
        func.coalesce(func.sum(sub.c.stained_count), 0).label("stained_slides"),
    ).select_from(sub).one()

    page_q = db.query(sub.c.case_id, sub.c.accession_no)
    if bucket == "pending":
        page_q = page_q.filter(sub.c.pending_count > 0)
    elif bucket == "completed":
        page_q = page_q.filter(sub.c.pending_count == 0)
    elif bucket == "recut":
        page_q = page_q.filter(sub.c.recut_count > 0)

    total = page_q.count()
    rows = (
        page_q.order_by(sub.c.accession_no.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    case_ids = [r.case_id for r in rows]

    blocks_by_case = {cid: [] for cid in case_ids}
    if case_ids:
        # Only the blocks that carry one of this page's stains — a case's other
        # blocks hold nothing this worklist can show, print or process.
        relevant_block_ids = (
            db.query(SurgicalBlockStain.block_id)
            .outerjoin(
                AnatomicalPathologyTest,
                AnatomicalPathologyTest.id == SurgicalBlockStain.test_id,
            )
            .filter(is_internal_stain_order())
            .subquery()
        )
        blocks = (
            db.query(SurgicalBlock, SurgicalSpecimen.case_id)
            .join(SurgicalSpecimen, SurgicalSpecimen.id == SurgicalBlock.specimen_id)
            .filter(
                SurgicalSpecimen.case_id.in_(case_ids),
                SurgicalBlock.id.in_(db.query(relevant_block_ids.c.block_id)),
            )
            .options(
                joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case),
                selectinload(SurgicalBlock.stains).selectinload(
                    SurgicalBlockStain.stained_by
                ),
                selectinload(SurgicalBlock.stains).joinedload(SurgicalBlockStain.test),
            )
            .order_by(SurgicalSpecimen.specimen_label.asc(), SurgicalBlock.block_no.asc())
            .all()
        )
        for block, case_id in blocks:
            blocks_by_case[case_id].append(block)

    return {
        "items": [
            {"accession_no": r.accession_no, "blocks": blocks_by_case[r.case_id]}
            for r in rows
        ],
        "total": total,
        "bucket_counts": {
            "all": totals.all,
            "pending": totals.pending,
            "completed": totals.completed,
            "recut": totals.recut,
        },
        "slide_totals": {
            "pending": totals.pending_slides,
            "stained": totals.stained_slides,
        },
    }


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
