from sqlalchemy.orm import Session
from app.models.external_lab import ExternalLab
from app.schemas.external_lab import ExternalLabCreate, ExternalLabUpdate

def get_external_labs(db: Session, skip: int = 0, limit: int = 100, active_only: bool = False):
    query = db.query(ExternalLab)
    if active_only:
        query = query.filter(ExternalLab.is_active == True)
    return query.order_by(ExternalLab.id.asc()).offset(skip).limit(limit).all()

def get_external_lab(db: Session, lab_id: int):
    return db.query(ExternalLab).filter(ExternalLab.id == lab_id).first()

def create_external_lab(db: Session, obj_in: ExternalLabCreate):
    db_obj = ExternalLab(**obj_in.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_external_lab(db: Session, lab_id: int, obj_in: ExternalLabUpdate):
    db_obj = get_external_lab(db, lab_id)
    if not db_obj:
        return None
    for field, value in obj_in.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_external_lab(db: Session, lab_id: int) -> bool:
    db_obj = get_external_lab(db, lab_id)
    if not db_obj:
        return False
    db.delete(db_obj)
    db.commit()
    return True
