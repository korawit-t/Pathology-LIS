from sqlalchemy.orm import Session
from app.models.tumor_registry import TumorRegistry
from app.schemas.tumor_registry import TumorRegistryUpsert
from typing import Optional


def get_by_case_id(db: Session, case_id: int) -> Optional[TumorRegistry]:
    return db.query(TumorRegistry).filter(TumorRegistry.surgical_case_id == case_id).first()


def upsert(db: Session, case_id: int, data: TumorRegistryUpsert, user_id: Optional[int] = None) -> TumorRegistry:
    record = get_by_case_id(db, case_id)
    if record is None:
        record = TumorRegistry(surgical_case_id=case_id, created_by_id=user_id)
        db.add(record)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record
