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


def list_correlations(db: Session, skip: int = 0, limit: int = 20,
                       result: str = None, start_date=None, end_date=None) -> dict:
    from app.models.surgical_report import SurgicalReport
    from sqlalchemy import func

    q = db.query(SurgicalCaseCorrelation)
    if result:
        q = q.filter(SurgicalCaseCorrelation.correlation_result == result)
    if start_date:
        q = q.filter(SurgicalCaseCorrelation.correlated_at >= start_date)
    if end_date:
        from datetime import datetime, time
        q = q.filter(SurgicalCaseCorrelation.correlated_at <= datetime.combine(end_date, time.max))
    total = q.count()
    rows = q.order_by(SurgicalCaseCorrelation.correlated_at.desc()).offset(skip).limit(limit).all()

    case_ids = {r.from_case_id for r in rows} | {r.to_case_id for r in rows}
    report_map: dict[int, int] = {}
    if case_ids:
        subq = (db.query(SurgicalReport.case_id, func.max(SurgicalReport.id).label("max_id"))
                .filter(SurgicalReport.case_id.in_(case_ids),
                        SurgicalReport.status == "published")
                .group_by(SurgicalReport.case_id).subquery())
        report_map = {row.case_id: row.max_id for row in db.query(subq).all()}

    def _with_reports(c: SurgicalCaseCorrelation) -> dict:
        base = _serialize(c)
        base["from_report_id"] = report_map.get(c.from_case_id)
        base["to_report_id"] = report_map.get(c.to_case_id)
        return base

    return {"items": [_with_reports(r) for r in rows], "total": total}


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
