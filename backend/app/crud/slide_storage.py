from sqlalchemy.orm import Session, joinedload, contains_eager
from sqlalchemy import desc, not_, select, or_, func
from app.models.slide_storage import SlideStorageRun, SlideStorageDetail
from app.schemas.slide_storage import SlideStorageRunCreateBatch
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.gyne_cyto_stain import GyneCytologyStain
from app.models.nongyne_cyto_stain import NongyneCytologyStain
from datetime import datetime
from app.utils.time import local_now
from typing import Optional

def generate_slide_storage_run_number(db: Session):
    today_str = local_now().strftime("%Y%m%d")
    prefix = f"S-STORE-{today_str}"

    last_run = (
        db.query(SlideStorageRun)
        .filter(SlideStorageRun.run_no.like(f"{prefix}%"))
        .order_by(SlideStorageRun.run_no.desc())
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

def get_pending_storage_slides_tree(db: Session, stain_category: Optional[str] = None):
    if stain_category == "Gyne":
        return get_pending_gyne_slides_tree(db)
    if stain_category == "NonGyne":
        return get_pending_nongyne_slides_tree(db)
    stored_subquery = select(SlideStorageDetail.stain_id)

    block_chain = (
        joinedload(SurgicalBlockStain.block)
        .joinedload(SurgicalBlock.specimen)
        .joinedload(SurgicalSpecimen.case)
    )

    base_filter = [
        SurgicalBlockStain.status.in_(["stained", "completed", "slide_dispatched"]),
        not_(SurgicalBlockStain.id.in_(stored_subquery)),
    ]

    if stain_category == "HE":
        query = (
            db.query(SurgicalBlockStain)
            .join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
            .options(block_chain, contains_eager(SurgicalBlockStain.test))
            .filter(*base_filter, AnatomicalPathologyTest.system_code == "HE_ROUTINE")
        )
    elif stain_category == "IHC":
        query = (
            db.query(SurgicalBlockStain)
            .join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
            .options(block_chain, contains_eager(SurgicalBlockStain.test))
            .filter(*base_filter, AnatomicalPathologyTest.category == "IHC")
        )
    elif stain_category == "Special":
        query = (
            db.query(SurgicalBlockStain)
            .join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
            .options(block_chain, contains_eager(SurgicalBlockStain.test))
            .filter(
                *base_filter,
                AnatomicalPathologyTest.category.in_(["Histochem", "Special stain"]),
                or_(
                    AnatomicalPathologyTest.system_code != "HE_ROUTINE",
                    AnatomicalPathologyTest.system_code.is_(None),
                ),
            )
        )
    else:
        query = (
            db.query(SurgicalBlockStain)
            .options(block_chain, joinedload(SurgicalBlockStain.test))
            .filter(*base_filter)
        )

    all_stains = query.all()

    case_map = {}
    for stain in all_stains:
        block_obj = stain.block
        if not block_obj:
            continue
            
        spec_obj = block_obj.specimen
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

        # label the slide nicely
        test_name = stain.test.name if stain.test else "H&E"
        slide_label = f"{case_obj.accession_no} {block_obj.block_code} ({test_name} #{stain.slide_no})"

        case_map[case_id]["children"].append(
            {
                "key": stain.id,
                "id": stain.id,
                "code": slide_label,
                "isCase": False,
            }
        )

    result = list(case_map.values())
    result.sort(key=lambda x: x["code"])

    return result

def get_pending_gyne_slides_tree(db: Session):
    stored_subquery = select(SlideStorageDetail.gyne_stain_id).where(SlideStorageDetail.gyne_stain_id.isnot(None))
    stains = (
        db.query(GyneCytologyStain)
        .options(joinedload(GyneCytologyStain.case), joinedload(GyneCytologyStain.test))
        .filter(
            GyneCytologyStain.status.in_(["stained", "completed"]),
            ~GyneCytologyStain.id.in_(stored_subquery),
        )
        .all()
    )
    case_map: dict = {}
    for stain in stains:
        if not stain.case:
            continue
        case_id = stain.case_id
        if case_id not in case_map:
            case_map[case_id] = {
                "key": f"case-{case_id}",
                "id": case_id,
                "code": stain.case.accession_no,
                "isCase": True,
                "children": [],
            }
        test_name = stain.test.name if stain.test else "Pap"
        case_map[case_id]["children"].append({
            "key": stain.id,
            "id": stain.id,
            "code": f"{stain.case.accession_no} ({test_name} #{stain.slide_no})",
            "isCase": False,
        })
    result = sorted(case_map.values(), key=lambda x: x["code"])
    return result


def get_pending_nongyne_slides_tree(db: Session):
    stored_subquery = select(SlideStorageDetail.nongyne_stain_id).where(SlideStorageDetail.nongyne_stain_id.isnot(None))
    stains = (
        db.query(NongyneCytologyStain)
        .options(joinedload(NongyneCytologyStain.case), joinedload(NongyneCytologyStain.test))
        .filter(
            NongyneCytologyStain.status.in_(["stained", "completed"]),
            ~NongyneCytologyStain.id.in_(stored_subquery),
        )
        .all()
    )
    case_map: dict = {}
    for stain in stains:
        if not stain.case:
            continue
        case_id = stain.case_id
        if case_id not in case_map:
            case_map[case_id] = {
                "key": f"case-{case_id}",
                "id": case_id,
                "code": stain.case.accession_no,
                "isCase": True,
                "children": [],
            }
        test_name = stain.test.name if stain.test else "H&E"
        case_map[case_id]["children"].append({
            "key": stain.id,
            "id": stain.id,
            "code": f"{stain.case.accession_no} ({test_name} #{stain.slide_no})",
            "isCase": False,
        })
    result = sorted(case_map.values(), key=lambda x: x["code"])
    return result


def create_slide_storage_run_batch(db: Session, obj_in: SlideStorageRunCreateBatch):
    auto_run_no = generate_slide_storage_run_number(db)

    db_run = SlideStorageRun(
        run_no=auto_run_no,
        user_id=obj_in.user_id,
        stain_category=obj_in.stain_category,
        started_at=local_now(),
        finished_at=local_now(),
        remark=obj_in.remark
    )

    try:
        db.add(db_run)
        db.flush() 

        for item in obj_in.items:
            if obj_in.stain_category == "Gyne":
                db_detail = SlideStorageDetail(
                    run_id=db_run.id,
                    gyne_stain_id=item.stain_id,
                    storage_location=item.storage_location,
                    remark=item.remark,
                )
            elif obj_in.stain_category == "NonGyne":
                db_detail = SlideStorageDetail(
                    run_id=db_run.id,
                    nongyne_stain_id=item.stain_id,
                    storage_location=item.storage_location,
                    remark=item.remark,
                )
            else:
                db_detail = SlideStorageDetail(
                    run_id=db_run.id,
                    stain_id=item.stain_id,
                    storage_location=item.storage_location,
                    remark=item.remark,
                )
            db.add(db_detail)

        db.commit()
        db.refresh(db_run)
        return db_run
    except Exception as e:
        db.rollback()
        raise e

def search_runs_by_accession(db: Session, accession_no: str, stain_category: Optional[str] = None):
    """Find all slide storage runs containing slides from the given accession number.
    Searches across surgical, gyne, and nongyne stain types."""
    from app.models.surgical_case import SurgicalCase
    from app.models.gyne_cyto_case import GyneCytologyCase
    from app.models.nongyne_cyto_case import NongyneCytologyCase

    # Surgical stain search
    surgical_ids = (
        db.query(SlideStorageRun.id)
        .join(SlideStorageRun.details)
        .join(SlideStorageDetail.stain)
        .join(SurgicalBlockStain.block)
        .join(SurgicalBlock.specimen)
        .join(SurgicalSpecimen.case)
        .filter(
            SurgicalCase.accession_no.ilike(f"%{accession_no}%"),
            SlideStorageDetail.stain_id.isnot(None),
        )
    )
    # Gyne stain search
    gyne_ids = (
        db.query(SlideStorageRun.id)
        .join(SlideStorageRun.details)
        .join(SlideStorageDetail.gyne_stain)
        .join(GyneCytologyStain.case)
        .filter(
            GyneCytologyCase.accession_no.ilike(f"%{accession_no}%"),
            SlideStorageDetail.gyne_stain_id.isnot(None),
        )
    )
    # NonGyne stain search
    nongyne_ids = (
        db.query(SlideStorageRun.id)
        .join(SlideStorageRun.details)
        .join(SlideStorageDetail.nongyne_stain)
        .join(NongyneCytologyStain.case)
        .filter(
            NongyneCytologyCase.accession_no.ilike(f"%{accession_no}%"),
            SlideStorageDetail.nongyne_stain_id.isnot(None),
        )
    )

    matched_ids = surgical_ids.union(gyne_ids).union(nongyne_ids)

    query = (
        db.query(SlideStorageRun)
        .filter(SlideStorageRun.id.in_(matched_ids))
        .options(
            joinedload(SlideStorageRun.details).joinedload(SlideStorageDetail.stain)
            .joinedload(SurgicalBlockStain.block).joinedload(SurgicalBlock.specimen),
            joinedload(SlideStorageRun.details).joinedload(SlideStorageDetail.stain)
            .joinedload(SurgicalBlockStain.test),
            joinedload(SlideStorageRun.details).joinedload(SlideStorageDetail.gyne_stain)
            .joinedload(GyneCytologyStain.case),
            joinedload(SlideStorageRun.details).joinedload(SlideStorageDetail.gyne_stain)
            .joinedload(GyneCytologyStain.test),
            joinedload(SlideStorageRun.details).joinedload(SlideStorageDetail.nongyne_stain)
            .joinedload(NongyneCytologyStain.case),
            joinedload(SlideStorageRun.details).joinedload(SlideStorageDetail.nongyne_stain)
            .joinedload(NongyneCytologyStain.test),
        )
    )
    if stain_category:
        query = query.filter(SlideStorageRun.stain_category == stain_category)

    return query.all()


def get_slide_storage_runs(db: Session, skip: int = 0, limit: int = 100, stain_category: Optional[str] = None):
    query = db.query(SlideStorageRun)
    if stain_category:
        query = query.filter(SlideStorageRun.stain_category == stain_category)
    return query.order_by(desc(SlideStorageRun.id)).offset(skip).limit(limit).all()

def get_slide_storage_run_detail(db: Session, run_id: int):
    return (
        db.query(SlideStorageRun)
        .options(
            # Surgical stain chain
            joinedload(SlideStorageRun.details)
            .joinedload(SlideStorageDetail.stain)
            .joinedload(SurgicalBlockStain.block)
            .joinedload(SurgicalBlock.specimen),
            joinedload(SlideStorageRun.details)
            .joinedload(SlideStorageDetail.stain)
            .joinedload(SurgicalBlockStain.test),
            # Gyne cyto stain
            joinedload(SlideStorageRun.details)
            .joinedload(SlideStorageDetail.gyne_stain)
            .joinedload(GyneCytologyStain.case),
            joinedload(SlideStorageRun.details)
            .joinedload(SlideStorageDetail.gyne_stain)
            .joinedload(GyneCytologyStain.test),
            # NonGyne cyto stain
            joinedload(SlideStorageRun.details)
            .joinedload(SlideStorageDetail.nongyne_stain)
            .joinedload(NongyneCytologyStain.case),
            joinedload(SlideStorageRun.details)
            .joinedload(SlideStorageDetail.nongyne_stain)
            .joinedload(NongyneCytologyStain.test),
        )
        .filter(SlideStorageRun.id == run_id)
        .first()
    )

def _slide_detail_options():
    return (
        joinedload(SlideStorageDetail.stain).joinedload(SurgicalBlockStain.block).joinedload(SurgicalBlock.specimen),
        joinedload(SlideStorageDetail.stain).joinedload(SurgicalBlockStain.test),
        joinedload(SlideStorageDetail.gyne_stain).joinedload(GyneCytologyStain.case),
        joinedload(SlideStorageDetail.gyne_stain).joinedload(GyneCytologyStain.test),
        joinedload(SlideStorageDetail.nongyne_stain).joinedload(NongyneCytologyStain.case),
        joinedload(SlideStorageDetail.nongyne_stain).joinedload(NongyneCytologyStain.test),
        joinedload(SlideStorageDetail.run),
        joinedload(SlideStorageDetail.discard_by),
    )

def _build_slide_detail_query(db: Session, discard: bool, search: str = "", stain_category: Optional[str] = None):
    from app.models.surgical_case import SurgicalCase
    from app.models.gyne_cyto_case import GyneCytologyCase
    from app.models.nongyne_cyto_case import NongyneCytologyCase

    q = db.query(SlideStorageDetail).filter(SlideStorageDetail.discard_status.is_(discard))
    if stain_category:
        q = q.join(SlideStorageDetail.run).filter(SlideStorageRun.stain_category == stain_category)
    if search:
        surgical_ids = (
            db.query(SlideStorageDetail.id)
            .join(SlideStorageDetail.stain)
            .join(SurgicalBlockStain.block)
            .join(SurgicalBlock.specimen)
            .join(SurgicalSpecimen.case)
            .filter(SurgicalCase.accession_no.ilike(f"%{search}%"))
        )
        gyne_ids = (
            db.query(SlideStorageDetail.id)
            .join(SlideStorageDetail.gyne_stain)
            .join(GyneCytologyStain.case)
            .filter(GyneCytologyCase.accession_no.ilike(f"%{search}%"))
        )
        nongyne_ids = (
            db.query(SlideStorageDetail.id)
            .join(SlideStorageDetail.nongyne_stain)
            .join(NongyneCytologyStain.case)
            .filter(NongyneCytologyCase.accession_no.ilike(f"%{search}%"))
        )
        matched_ids = surgical_ids.union(gyne_ids).union(nongyne_ids)
        q = q.filter(SlideStorageDetail.id.in_(matched_ids))
    return q

def get_stored_slide_details(db: Session, skip: int = 0, limit: int = 50, search: str = "", stain_category: Optional[str] = None):
    q = _build_slide_detail_query(db, discard=False, search=search, stain_category=stain_category)
    total = q.count()
    items = (
        q.options(*_slide_detail_options())
        .order_by(SlideStorageDetail.stored_at)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total

def get_disposed_slide_details(db: Session, skip: int = 0, limit: int = 50, search: str = "", stain_category: Optional[str] = None):
    q = _build_slide_detail_query(db, discard=True, search=search, stain_category=stain_category)
    total = q.count()
    items = (
        q.options(*_slide_detail_options())
        .order_by(desc(SlideStorageDetail.discard_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total

def dispose_slide_details(db: Session, detail_ids: list, user_id: int):
    now = local_now()
    db.query(SlideStorageDetail).filter(SlideStorageDetail.id.in_(detail_ids)).update(
        {"discard_status": True, "discard_at": now, "discard_by_id": user_id},
        synchronize_session=False,
    )
    db.commit()
    return db.query(SlideStorageDetail).options(*_slide_detail_options()).filter(
        SlideStorageDetail.id.in_(detail_ids)
    ).all()

def get_stored_slide_runs(db: Session, skip: int = 0, limit: int = 50, stain_category: Optional[str] = None):
    base_filter = [SlideStorageRun.discard_status.is_(False)]
    if stain_category:
        base_filter.append(SlideStorageRun.stain_category == stain_category)
    total = db.query(func.count(SlideStorageRun.id)).filter(*base_filter).scalar() or 0
    items = db.query(SlideStorageRun).filter(*base_filter).order_by(desc(SlideStorageRun.id)).offset(skip).limit(limit).all()
    return items, total

def get_disposed_slide_runs(db: Session, skip: int = 0, limit: int = 50, stain_category: Optional[str] = None):
    base_filter = [SlideStorageRun.discard_status.is_(True)]
    if stain_category:
        base_filter.append(SlideStorageRun.stain_category == stain_category)
    total = db.query(func.count(SlideStorageRun.id)).filter(*base_filter).scalar() or 0
    items = db.query(SlideStorageRun).filter(*base_filter).order_by(desc(SlideStorageRun.discard_at)).offset(skip).limit(limit).all()
    return items, total

def dispose_slide_runs(db: Session, run_ids: list, user_id: int):
    now = local_now()
    db.query(SlideStorageRun).filter(SlideStorageRun.id.in_(run_ids)).update(
        {"discard_status": True, "discard_at": now, "discard_by_id": user_id},
        synchronize_session=False,
    )
    db.commit()
    return db.query(SlideStorageRun).filter(SlideStorageRun.id.in_(run_ids)).all()

def delete_slide_storage_run(db: Session, run_id: int):
    db_obj = db.query(SlideStorageRun).filter(SlideStorageRun.id == run_id).first()
    if db_obj:
        db.query(SlideStorageDetail).filter(SlideStorageDetail.run_id == run_id).delete()
        db.delete(db_obj)
        db.commit()
        return True
    return False
