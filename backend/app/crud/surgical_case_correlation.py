from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.surgical_case_correlation import SurgicalCaseCorrelation
from app.schemas.surgical_case_correlation import (
    SurgicalCaseCorrelationCreate,
    SurgicalCaseCorrelationUpdate,
)


def _serialize(c: SurgicalCaseCorrelation) -> dict:
    return {
        "id": c.id,
        "from_case_id": c.from_case_id,
        "to_case_id": c.to_case_id,
        "from_accession_no": c.from_accession_no,
        "to_accession_no": c.to_accession_no,
        "correlation_result": c.correlation_result,
        "comment": c.comment,
        "correlated_by": {
            "id": c.correlated_by.id,
            "full_name": c.correlated_by.full_name,
        } if c.correlated_by else None,
        "correlated_at": c.correlated_at,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


def get_by_case(db: Session, case_id: int) -> list[dict]:
    rows = (
        db.query(SurgicalCaseCorrelation)
        .filter(
            or_(
                SurgicalCaseCorrelation.from_case_id == case_id,
                SurgicalCaseCorrelation.to_case_id == case_id,
            )
        )
        .order_by(SurgicalCaseCorrelation.correlated_at.desc())
        .all()
    )
    return [_serialize(r) for r in rows]


def create(db: Session, payload: SurgicalCaseCorrelationCreate, current_user_id: int) -> dict:
    obj = SurgicalCaseCorrelation(
        from_case_id=payload.from_case_id,
        to_case_id=payload.to_case_id,
        from_accession_no=payload.from_accession_no,
        to_accession_no=payload.to_accession_no,
        correlation_result=payload.correlation_result,
        comment=payload.comment,
        correlated_by_id=current_user_id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _serialize(obj)


def update(db: Session, correlation_id: int, payload: SurgicalCaseCorrelationUpdate) -> dict | None:
    obj = db.query(SurgicalCaseCorrelation).filter(SurgicalCaseCorrelation.id == correlation_id).first()
    if not obj:
        return None
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return _serialize(obj)


def delete(db: Session, correlation_id: int) -> bool:
    obj = db.query(SurgicalCaseCorrelation).filter(SurgicalCaseCorrelation.id == correlation_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True
