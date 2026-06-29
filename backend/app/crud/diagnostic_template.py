from sqlalchemy.orm import Session
from app.models.diagnostic_template import DiagnosticTemplate
from app.schemas.diagnostic_template import (
    DiagnosticTemplateCreate,
    DiagnosticTemplateUpdate,
)


def get_diagnostic_template(db: Session, template_id: int):
    return (
        db.query(DiagnosticTemplate)
        .filter(DiagnosticTemplate.id == template_id)
        .first()
    )


def get_diagnostic_templates(
    db: Session, skip: int = 0, limit: int = 100, category: str = None
):
    query = db.query(DiagnosticTemplate)
    if category:
        query = query.filter(DiagnosticTemplate.category == category)
    return query.offset(skip).limit(limit).all()


def create_diagnostic_template(
    db: Session, template: DiagnosticTemplateCreate, user_id: int = None
):
    db_item = DiagnosticTemplate(**template.model_dump(), created_by_id=user_id)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


def update_diagnostic_template(
    db: Session, template_id: int, template: DiagnosticTemplateUpdate
):
    db_query = db.query(DiagnosticTemplate).filter(DiagnosticTemplate.id == template_id)
    db_item = db_query.first()
    if db_item:
        update_data = template.model_dump(exclude_unset=True)
        db_query.update(update_data, synchronize_session=False)
        db.commit()
        db.refresh(db_item)
    return db_item


def delete_diagnostic_template(db: Session, template_id: int):
    db_item = (
        db.query(DiagnosticTemplate)
        .filter(DiagnosticTemplate.id == template_id)
        .first()
    )
    if db_item:
        db.delete(db_item)
        db.commit()
    return db_item
