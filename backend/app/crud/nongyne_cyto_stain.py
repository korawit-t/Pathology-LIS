import logging
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.crud import stain_signoff
from app.crud.stain_signoff import track_ready
from app.utils.stain_filters import SPECIAL_STAIN_CATEGORIES
from app.utils.time import local_now
from app.models.nongyne_cyto_stain import NongyneCytologyStain
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.schemas.nongyne_cyto_stain import NongyneStainCreate, NongyneStainUpdate
from app.models.system_setting import SystemSetting

logger = logging.getLogger(__name__)
from app.models.nongyne_cyto_stain import NongyneStainRun, NongyneStainRunDetail
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.enums.case_states import NONGYNE_CLOSED
from fastapi import HTTPException


def create_stain(db: Session, obj_in: NongyneStainCreate):
    db_obj = NongyneCytologyStain(**obj_in.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_stains_by_case(db: Session, case_id: int):
    return (
        db.query(NongyneCytologyStain).filter(NongyneCytologyStain.case_id == case_id).all()
    )


def update_stain(db: Session, stain_id: int, obj_in: NongyneStainUpdate):
    db_obj = (
        db.query(NongyneCytologyStain).filter(NongyneCytologyStain.id == stain_id).first()
    )
    if not db_obj:
        return None

    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    if "status" in update_data:
        track_ready(db_obj)

    db.commit()
    db.refresh(db_obj)
    return db_obj


# Additional stains a non-gyne sign-off can report: IHC and special stains.
# The routine cytology stains (Pap, Diff-Quik…) and Molecular orders aren't
# results that "come out" on their own.
_SIGNOFF_CATEGORIES = ("ihc",) + SPECIAL_STAIN_CATEGORIES


def _signoff_stains_query(db: Session, case_id: int, *entities):
    return (
        db.query(*(entities or (NongyneCytologyStain,)))
        .join(AnatomicalPathologyTest, AnatomicalPathologyTest.id == NongyneCytologyStain.test_id)
        .filter(
            NongyneCytologyStain.case_id == case_id,
            func.lower(AnatomicalPathologyTest.category).in_(_SIGNOFF_CATEGORIES),
        )
    )


def get_case_signoff_stains(db: Session, case_id: int) -> list[dict]:
    """The non-gyne sign-off page's list: the same set a sign-off can stamp,
    in slide order (shape shared with the surgical sign-off list)."""
    stains = (
        _signoff_stains_query(db, case_id)
        .options(joinedload(NongyneCytologyStain.test))
        .order_by(NongyneCytologyStain.slide_no, NongyneCytologyStain.id)
        .all()
    )
    return [
        {
            "stain_id": s.id,
            "block_code": None,
            "test_name": s.test.name if s.test else None,
            "category": s.test.category if s.test else None,
            "status": s.status,
            "is_external": bool(s.test and s.test.is_external),
            "reported_at": s.reported_at,
        }
        for s in stains
    ]


def mark_case_stains_reported(db: Session, case_id: int, at, include_unreviewed: bool) -> int:
    """At the pathologist's sign-off (publish_nongyne_report). Rule in
    crud.stain_signoff.mark_reported. Does not commit."""
    return stain_signoff.mark_reported(
        db, NongyneCytologyStain, _signoff_stains_query(db, case_id, NongyneCytologyStain.id),
        at, include_unreviewed,
    )


def mark_case_stains_released(db: Session, case_id: int, at) -> int:
    """The signed report was published. Does not commit."""
    return stain_signoff.mark_released(
        db, NongyneCytologyStain, _signoff_stains_query(db, case_id, NongyneCytologyStain.id), at
    )


def unmark_unreleased_stains(db: Session, case_id: int) -> int:
    """The approver sent the report back. Does not commit."""
    return stain_signoff.unmark_unreleased(
        db, NongyneCytologyStain, _signoff_stains_query(db, case_id, NongyneCytologyStain.id)
    )


def get_pending_print_stains(db: Session):
    """
    ดึงรายการสไลด์ที่ยังไม่ได้พิมพ์ (is_printed = False)
    พร้อมโหลดข้อมูล Case (Accession No) มาให้ Frontend ใช้งาน
    """
    return (
        db.query(NongyneCytologyStain)
        .options(joinedload(NongyneCytologyStain.case))
        .filter(NongyneCytologyStain.is_printed == False)
        .order_by(NongyneCytologyStain.created_at.desc())
        .all()
    )


def get_registered_queue_stains(db: Session):
    """
    ดึงรายการสไลด์ลงทะเบียนใหม่ พร้อมข้อมูลชื่อการตรวจจาก Master Data
    """
    return (
        db.query(NongyneCytologyStain)
        .options(
            joinedload(NongyneCytologyStain.case),
            joinedload(NongyneCytologyStain.test),
        )
        .filter(NongyneCytologyStain.status == "pending")
        .order_by(NongyneCytologyStain.created_at.asc())
        .all()
    )


def auto_create_default_stain(db: Session, case_id: int, count: int = 1):
    """
    สร้างสไลด์โดยดึง Stain จาก Master Data อัตโนมัติ (ใช้ System Code ถ้ามี)
    count = จำนวนสไลด์ที่จะสร้าง (slide_no วิ่งจาก 1..count)
    """
    setting = db.query(SystemSetting).first()

    test_id = None
    if setting and setting.default_non_gyne_test_id:
        test_id = setting.default_non_gyne_test_id
    else:
        pap_test = (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.system_code == "PAP_ROUTINE")
            .first()
        )
        test_id = pap_test.id if pap_test else None

    if test_id is None:
        return []

    db_objs = [
        NongyneCytologyStain(
            case_id=case_id,
            test_id=test_id,
            slide_no=slide_no,
            status="pending",
        )
        for slide_no in range(1, count + 1)
    ]
    db.add_all(db_objs)
    db.commit()
    for db_obj in db_objs:
        db.refresh(db_obj)
    return db_objs


def create_stain_run(
    db: Session, stainer_id: str, stain_ids: list[int], run_no: str, user_id: int
):
    try:
        # 1. สร้างหัว Run
        db_run = NongyneStainRun(
            run_no=run_no,
            stainer_id=stainer_id,
            operator_id=user_id,
            status="completed",
        )
        db.add(db_run)
        db.flush()

        # 2. สร้าง Details และ Update สถานะสไลด์
        # The run is saved already completed, so the slides are readable now.
        now = local_now()
        for s_id in stain_ids:
            detail = NongyneStainRunDetail(stain_run_id=db_run.id, stain_id=s_id)
            db.add(detail)

            db.query(NongyneCytologyStain).filter(NongyneCytologyStain.id == s_id).update(
                {"status": "stained", "ready_at": now}
            )

        # Update parent case status so they appear in slide dispatch manual select
        stained_case_ids = (
            db.query(NongyneCytologyStain.case_id)
            .filter(NongyneCytologyStain.id.in_(stain_ids))
            .distinct()
            .all()
        )
        for (cid,) in stained_case_ids:
            # เคสที่ออกผลไปแล้วต้องไม่ถูกดันกลับเป็น "stained" — โครงเดียวกับ
            # gyne_cyto_stain.py (non-gyne ไม่มีสถานะ "revised" จึงเท่ากับ
            # NONGYNE_TERMINAL อยู่แล้ว แต่ใช้ชื่อ CLOSED ให้อ่านคู่กันได้)
            db.query(NongyneCytologyCase).filter(
                NongyneCytologyCase.id == cid,
                NongyneCytologyCase.status.notin_(sorted(NONGYNE_CLOSED)),
            ).update({"status": "stained"}, synchronize_session=False)

        db.commit()
        db.refresh(db_run)
        return db_run

    except Exception as e:
        db.rollback()
        logger.error("Error creating nongyne stain run: %s", e)
        raise HTTPException(
            status_code=400,
            detail="Cannot create stain run. Check if run_no is duplicate.",
        )


def get_all_stain_runs(db: Session, skip: int = 0, limit: int = 20):
    return (
        db.query(NongyneStainRun)
        .options(
            joinedload(NongyneStainRun.operator),
            joinedload(NongyneStainRun.details)
            .joinedload(NongyneStainRunDetail.stain_order)
            .joinedload(NongyneCytologyStain.case),
            joinedload(NongyneStainRun.details)
            .joinedload(NongyneStainRunDetail.stain_order)
            .joinedload(NongyneCytologyStain.test),
        )
        .order_by(NongyneStainRun.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
