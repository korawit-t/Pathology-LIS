import logging
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, status
from sqlalchemy.orm import Session
from typing import List

logger = logging.getLogger(__name__)

from app.db.database import get_db
from app.schemas.nongyne_case_image import NongyneCaseImageResponse, NongyneCaseImageUpdate
from app.models.nongyne_case_image import NongyneCaseImage
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.utils.file_handler import save_nongyne_image_local, delete_nongyne_image_local
from app.dependencies.auth import get_current_user, check_password_status
from app.core.roles import CAN_ACCESS_NONGYNE_CYTO_IMAGE

# 🔒 SECURITY_AUDIT.md N1 follow-up: gate every route in this router on
# CAN_ACCESS_NONGYNE_CYTO_IMAGE (admin / pathologist / senior_pathologist /
# cytotechnologist / lab_manager). Previously any authenticated user —
# including clinician / hospital — could upload, list, or delete non-gyne
# case images, which is the same PHI-leak class of bug N1 closed for the
# surgical router.
router = APIRouter(
    prefix="/nongyne-cytology",
    tags=["Non-Gyne Case Images"],
    dependencies=[
        Depends(check_password_status),
        Depends(CAN_ACCESS_NONGYNE_CYTO_IMAGE),
    ],
)


@router.post("/{case_id}/images", response_model=NongyneCaseImageResponse)
async def upload_nongyne_image(
    case_id: int,
    file: UploadFile = File(...),
    description: str = Form(None),
    order: int = Form(1),
    show_in_report: bool = Form(True),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    case = db.query(NongyneCytologyCase).filter(NongyneCytologyCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    image_url = await save_nongyne_image_local(case_id, file)

    db_image = NongyneCaseImage(
        case_id=case_id,
        image_url=image_url,
        original_filename=file.filename,
        description=description,
        order=order,
        show_in_report=show_in_report,
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    return db_image


@router.get("/{case_id}/images", response_model=List[NongyneCaseImageResponse])
def get_nongyne_images(case_id: int, db: Session = Depends(get_db)):
    return (
        db.query(NongyneCaseImage)
        .filter(NongyneCaseImage.case_id == case_id)
        .order_by(NongyneCaseImage.order)
        .all()
    )


@router.patch("/images/{image_id}", response_model=NongyneCaseImageResponse)
def update_nongyne_image(
    image_id: int,
    payload: NongyneCaseImageUpdate,
    db: Session = Depends(get_db),
):
    db_image = db.query(NongyneCaseImage).filter(NongyneCaseImage.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_image, field, value)
    db.commit()
    db.refresh(db_image)
    return db_image


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_nongyne_image(image_id: int, db: Session = Depends(get_db)):
    db_image = db.query(NongyneCaseImage).filter(NongyneCaseImage.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")
    try:
        delete_nongyne_image_local(db_image.image_url)
    except Exception as exc:
        logger.warning("Failed to delete nongyne image file %s: %s", db_image.image_url, exc)
    db.delete(db_image)
    db.commit()
    return None
