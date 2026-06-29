from sqlalchemy.orm import Session
from app.models.microscopic_image import MicroscopicImage
from app.schemas.microscopic_image import MicroscopicImageCreate

def create_micro_image(db: Session, obj_in: MicroscopicImageCreate, specimen_id: int, uploader_id: int):
    db_obj = MicroscopicImage(
        **obj_in.model_dump(),
        specimen_id=specimen_id,
        uploaded_by_id=uploader_id
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def get_multi_by_specimen(db: Session, specimen_id: int):
    return db.query(MicroscopicImage).filter(
        MicroscopicImage.specimen_id == specimen_id
    ).order_by(MicroscopicImage.sort_order.asc()).all()

def delete_micro_image(db: Session, image_id: int):
    db_obj = db.query(MicroscopicImage).get(image_id)
    if db_obj:
        db.delete(db_obj)
        db.commit()
    return db_obj