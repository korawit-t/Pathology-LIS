from sqlalchemy.orm import Session, joinedload
from sqlalchemy.sql import func
from app.utils.time import local_now
from app.models.surgical_block_stain import (
    SurgicalBlockStain,
    SurgicalStainRun,
    SurgicalStainRunDetail,
)
from app.schemas.stain_run import StainRunCreate
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_case import SurgicalCase
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.utils.block_workflow import assert_blocks_ready


def _assert_stains_ready_to_run(db: Session, stain_ids: list[int]) -> None:
    """Reject a run whose slides sit on blocks that haven't been cut yet.

    Stain orders are keyed by stain id, so resolve them back to their blocks
    before applying the pipeline gate.
    """
    if not stain_ids:
        return
    block_ids = [
        row[0]
        for row in db.query(SurgicalBlockStain.block_id)
        .filter(SurgicalBlockStain.id.in_(stain_ids))
        .all()
    ]
    assert_blocks_ready(db, "staining", block_ids)


def _sync_case_status_from_he_stains(db: Session, stain_ids: list[int]) -> None:
    """Set case status to 'stained' when all H&E routine stains in affected cases are
    done, for the first time only.

    is_slide_prepped is a one-way flag, only ever set True here, marking that the
    case already reached this milestone once. Without checking it, finishing an
    unrelated later stain run — e.g. a special stain/IHC ordered after the case was
    already dispatched to a pathologist — would bounce the case's status back to
    "stained" just because its original H&E set happens to already be complete,
    making it reappear in the Slide Dispatch "Manual Select" list
    (ManualSelectModal.tsx) even though it was already sent out. For those
    already-prepped cases, re-derive from any still-pending IHC/Histochem block
    stains instead, so a pending flag set by ordering that special stain/IHC still
    correctly clears once it's actually done.
    """
    from app.crud.surgical_block_stain import _update_case_status_from_block_stains

    case_ids_query = (
        db.query(SurgicalCase.id)
        .distinct()
        .join(SurgicalSpecimen)
        .join(SurgicalBlock)
        .join(SurgicalBlockStain)
        .filter(SurgicalBlockStain.id.in_(stain_ids))
        .all()
    )
    case_ids = [c[0] for c in case_ids_query]

    for case_id in case_ids:
        case = db.get(SurgicalCase, case_id)
        if not case:
            continue

        if case.is_slide_prepped:
            _update_case_status_from_block_stains(db, case_id)
            continue

        he_base = (
            db.query(SurgicalBlockStain)
            .join(SurgicalBlock)
            .join(SurgicalSpecimen)
            .join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
            .filter(
                SurgicalSpecimen.case_id == case_id,
                AnatomicalPathologyTest.system_code == "HE_ROUTINE",
            )
        )
        total_he = he_base.count()
        done_he = he_base.filter(
            SurgicalBlockStain.status.in_(["stained", "completed"])
        ).count()

        if total_he > 0 and total_he == done_he:
            db.query(SurgicalCase).filter(SurgicalCase.id == case_id).update(
                {"is_slide_prepped": True, "status": "stained"},
                synchronize_session=False,
            )


def get_run_details(db: Session, run_id: int):
    """
    Return {"run_info": SurgicalStainRun, "stains": [SurgicalBlockStain, ...]}
    with all necessary relations joined.
    """
    run = (
        db.query(SurgicalStainRun)
        .options(
            joinedload(SurgicalStainRun.operator),
            joinedload(SurgicalStainRun.details)
            .joinedload(SurgicalStainRunDetail.stain_order)
            .joinedload(SurgicalBlockStain.test),
            joinedload(SurgicalStainRun.details)
            .joinedload(SurgicalStainRunDetail.stain_order)
            .joinedload(SurgicalBlockStain.block)
            .joinedload(SurgicalBlock.specimen)
            .joinedload(SurgicalSpecimen.case),
        )
        .filter(SurgicalStainRun.id == run_id)
        .first()
    )
    if not run:
        return None
    stains = [d.stain_order for d in run.details if d.stain_order]
    return {"run_info": run, "stains": stains}


def update_run_status(db: Session, run_id: int, status: str):
    """
    Update สถานะการย้อม
    """
    db_run = db.query(SurgicalStainRun).filter(SurgicalStainRun.id == run_id).first()
    if db_run:
        db_run.status = status
        if status == "completed":
            db_run.completed_at = func.now()

            # อัปเดตสถานะสไลด์ทุกใบที่ผูกกับ Run นี้ในตารางกลางให้เป็น 'stained'
            # 1. หา IDs ของสไลด์ใน Run นี้
            details = (
                db.query(SurgicalStainRunDetail)
                .filter(SurgicalStainRunDetail.stain_run_id == run_id)
                .all()
            )
            stain_ids = [d.stain_id for d in details]

            # 2. Bulk Update ที่ตาราง SurgicalBlockStain
            db.query(SurgicalBlockStain).filter(
                SurgicalBlockStain.id.in_(stain_ids)
            ).update({"status": "stained"}, synchronize_session=False)

            _sync_case_status_from_he_stains(db, stain_ids)

        db.commit()
        db.refresh(db_run)
    return db_run


def create_stain_run(db: Session, obj_in: StainRunCreate, user_id: int):
    _assert_stains_ready_to_run(db, list(obj_in.stain_ids))

    today_str = local_now().strftime("%Y%m%d")
    prefix = f"RUN-{today_str}-"
    last_run = (
        db.query(SurgicalStainRun.run_no)
        .filter(SurgicalStainRun.run_no.like(f"{prefix}%"))
        .order_by(SurgicalStainRun.run_no.desc())
        .first()
    )
    new_no = int(last_run[0].split("-")[-1]) + 1 if last_run else 1
    run_no = f"{prefix}{new_no:03d}"

    db_run = SurgicalStainRun(
        run_no=run_no,
        stainer_id=obj_in.stainer_id,
        operator_id=user_id,
        status="running",
        started_at=local_now(),
    )
    db.add(db_run)
    db.flush()

    for stain_id in obj_in.stain_ids:
        db.add(SurgicalStainRunDetail(
            stain_run_id=db_run.id,
            stain_id=stain_id,
            is_success=True,
        ))

    db.query(SurgicalBlockStain).filter(
        SurgicalBlockStain.id.in_(obj_in.stain_ids)
    ).update(
        {"status": "stained", "stained_by_id": user_id, "updated_at": local_now()},
        synchronize_session=False,
    )

    _sync_case_status_from_he_stains(db, list(obj_in.stain_ids))

    db.commit()
    return (
        db.query(SurgicalStainRun)
        .options(joinedload(SurgicalStainRun.details))
        .filter(SurgicalStainRun.id == db_run.id)
        .first()
    )


def list_active_runs(db: Session, test_id: int = None):
    """
    ดึงรายการ Run ล่าสุด พร้อมโหลดรายละเอียดสไลด์และข้อมูล Master Data
    """
    # 🚩 2. เพิ่ม .joinedload(SurgicalBlockStain.test) เพื่อให้รู้ว่าสไลด์นั้นคือการย้อมอะไร

    query = db.query(SurgicalStainRun).options(
        joinedload(SurgicalStainRun.operator),
        joinedload(SurgicalStainRun.details)
        .joinedload(SurgicalStainRunDetail.stain_order)
        .joinedload(SurgicalBlockStain.block)
        .joinedload(SurgicalBlock.specimen)
        .joinedload(SurgicalSpecimen.case),
        joinedload(SurgicalStainRun.details)
        .joinedload(SurgicalStainRunDetail.stain_order)
        .joinedload(SurgicalBlockStain.test),
    )

    # 🚩 3. ปรับ Logic การกรองให้ใช้ test_id
    if test_id:
        query = (
            query.join(SurgicalStainRun.details)
            .join(SurgicalStainRunDetail.stain_order)
            .filter(SurgicalBlockStain.test_id == test_id)
        )

    return query.order_by(SurgicalStainRun.started_at.desc()).all()


def create_he_batch_run(db: Session, obj_in: dict, operator_id: int = None):
    # 0. ตรวจก่อนสร้าง Run: ตลับต้องผ่าน Sectioning มาแล้ว
    # (payload ใช้ชื่อ key ว่า block_id แต่ค่าจริงคือ stain id — ดูข้อ 3)
    _assert_stains_ready_to_run(
        db, [item.get("block_id") for item in obj_in.get("items", [])]
    )

    # 1. รันเลข Run No ด้วยวิธีหาเลขล่าสุด (Max)
    today_str = local_now().strftime("%Y%m%d")
    prefix = f"HE-{today_str}-"

    last_run = (
        db.query(SurgicalStainRun.run_no)
        .filter(SurgicalStainRun.run_no.like(f"{prefix}%"))
        .order_by(SurgicalStainRun.run_no.desc())
        .first()
    )

    new_no = int(last_run[0].split("-")[-1]) + 1 if last_run else 1
    run_no = f"{prefix}{new_no:03d}"

    # 2. สร้าง Master Record
    db_run = SurgicalStainRun(
        run_no=run_no,
        stainer_id=obj_in.get("stainer_id"),
        operator_id=operator_id,
        status="completed",
        started_at=local_now(),
        completed_at=local_now(),
    )
    db.add(db_run)
    db.flush()

    # 3. บันทึกรายละเอียด และรวม ID เพื่ออัปเดต Workflow
    items = obj_in.get("items", [])
    if items:
        # ใช้ชื่อ stain_id ให้สื่อความหมาย (จากเดิมใน payload คือ block_id)
        stain_ids = [item.get("block_id") for item in items]

        for s_id in stain_ids:
            detail = SurgicalStainRunDetail(
                stain_run_id=db_run.id, stain_id=s_id, is_success=True
            )
            db.add(detail)

        # 4. Bulk Update สถานะสไลด์เป็น 'stained'
        db.query(SurgicalBlockStain).filter(
            SurgicalBlockStain.id.in_(stain_ids)
        ).update(
            {"status": "stained", "updated_at": local_now()},
            synchronize_session=False,
        )

        # 5. อัปเดต case status เป็น "stained" ถ้า H&E ของ case ครบทุกอัน
        _sync_case_status_from_he_stains(db, stain_ids)

    db.commit()

    # ดึงข้อมูลกลับพร้อม Details เพื่อส่งให้ Frontend
    return (
        db.query(SurgicalStainRun)
        .options(joinedload(SurgicalStainRun.details))
        .filter(SurgicalStainRun.id == db_run.id)
        .first()
    )
