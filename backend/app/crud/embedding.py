# app/crud/embedding.py
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from app.utils.time import local_now
from app.models.embedding import EmbeddingRun, EmbeddingDetail
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_case import SurgicalCase


def generate_embedding_run_no(db: Session) -> str:
    prefix = f"EMB-{local_now().strftime('%Y%m%d')}-"
    last_run = (
        db.query(EmbeddingRun)
        .filter(EmbeddingRun.run_no.like(f"{prefix}%"))
        .order_by(EmbeddingRun.run_no.desc())
        .first()
    )
    new_seq = (int(last_run.run_no.split("-")[-1]) + 1) if last_run else 1
    return f"{prefix}{new_seq:04d}"


def create_embedding_run(db: Session, user_id: int):
    today_str = local_now().strftime("%Y%m%d")
    prefix = f"EMB-{today_str}-"

    # Reuse an empty run from today for this user
    existing_empty_run = (
        db.query(EmbeddingRun)
        .filter(EmbeddingRun.user_id == user_id, EmbeddingRun.run_no.like(f"{prefix}%"))
        .filter(~EmbeddingRun.details.any())
        .first()
    )
    if existing_empty_run:
        return existing_empty_run

    try:
        last_run = (
            db.query(EmbeddingRun)
            .filter(EmbeddingRun.run_no.like(f"{prefix}%"))
            .order_by(EmbeddingRun.run_no.desc())
            .with_for_update()
            .first()
        )
        new_seq = (int(last_run.run_no.split("-")[-1]) + 1) if last_run else 1
        db_obj = EmbeddingRun(
            run_no=f"{prefix}{new_seq:04d}",
            user_id=user_id,
            started_at=local_now(),
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    except Exception as e:
        db.rollback()
        if "UniqueViolation" in str(e) or "duplicate key" in str(e).lower():
            return create_embedding_run(db, user_id)
        raise e


def add_multiple_blocks_to_embedding(db: Session, run_id: int, block_ids: list[int]):
    """
    Add blocks to an embedding run, mark each block as embedded,
    and promote the parent case to 'embedded' status once all its
    blocks have been embedded.
    """
    blocks = (
        db.query(SurgicalBlock)
        .options(joinedload(SurgicalBlock.specimen))
        .filter(SurgicalBlock.id.in_(block_ids))
        .all()
    )

    case_ids_to_check: set[int] = set()
    new_details = []

    for block in blocks:
        detail = EmbeddingDetail(
            run_id=run_id, block_id=block.id, embedded_at=local_now()
        )
        db.add(detail)
        block.status = "embedded"
        new_details.append(detail)
        if block.specimen:
            case_ids_to_check.add(block.specimen.case_id)

    # Flush so the block status updates are visible to the queries below
    db.flush()

    for case_id in case_ids_to_check:
        # Count blocks in this case that are NOT yet embedded
        not_embedded_count = (
            db.query(SurgicalBlock)
            .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
            .filter(
                SurgicalSpecimen.case_id == case_id,
                SurgicalBlock.status != "embedded",
            )
            .count()
        )
        if not_embedded_count == 0:
            case = db.query(SurgicalCase).filter(SurgicalCase.id == case_id).first()
            if case:
                case.status = "embedded"

    db.commit()
    return new_details


def get_embedding_runs(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(EmbeddingRun)
        .options(
            joinedload(EmbeddingRun.user),
            joinedload(EmbeddingRun.details)
            .joinedload(EmbeddingDetail.block)
            .joinedload(SurgicalBlock.specimen)
            .joinedload(SurgicalSpecimen.case)
        )
        .order_by(EmbeddingRun.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_pending_blocks(db: Session):
    return db.query(SurgicalBlock).filter(SurgicalBlock.status == "processed").all()


def get_embedding_pending_tree(db: Session):
    all_blocks = (
        db.query(SurgicalBlock)
        .options(joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case))
        .filter(SurgicalBlock.status == "processed")
        .all()
    )

    case_map = {}
    for block in all_blocks:
        acc_no = block.accession_no
        if not acc_no:
            continue
        case_id = block.specimen.case_id
        if case_id not in case_map:
            case_map[case_id] = {
                "key": f"case-{case_id}",
                "id": case_id,
                "code": acc_no,
                "isCase": True,
                "children": [],
            }
        case_map[case_id]["children"].append(
            {
                "key": block.id,
                "id": block.id,
                "code": block.block_code,
                "isCase": False,
                "is_decal": block.is_decal,
            }
        )

    return list(case_map.values())


def delete_empty_embedding_run(db: Session, run_id: int):
    db_run = db.query(EmbeddingRun).filter(EmbeddingRun.id == run_id).first()
    if db_run and not db_run.details:
        db.delete(db_run)
        db.commit()
        return True
    return False
