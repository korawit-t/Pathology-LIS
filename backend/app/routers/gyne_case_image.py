import logging
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, status
from sqlalchemy.orm import Session
from typing import List

logger = logging.getLogger(__name__)

from app.db.database import get_db
from app.schemas.gyne_case_image import GyneCaseImageResponse, GyneCaseImageUpdate
from app.models.gyne_case_image import GyneCaseImage
from app.models.gyne_cyto_case import GyneCytologyCase
from app.utils.file_handler import save_gyne_image_local, delete_gyne_image_local
from app.dependencies.auth import get_current_user, check_password_status
from app.core.roles import CAN_ACCESS_GYNE_CYTO_IMAGE
from app.utils.case_lock import (
    assert_gyne_case_unlocked,
    assert_gyne_case_id_unlocked,
)

# 🔒 Mirrors routers/nongyne_case_image.py with the equivalent role gate:
# CAN_ACCESS_GYNE_CYTO_IMAGE (admin / pathologist / senior_pathologist /
# cytotechnologist / lab_manager). Cytotechnologists are the role that
# actually screens gyne cases and so must be able to attach microscopic
# images to them.
router = APIRouter(
    prefix="/gyne-cytology",
    tags=["Gyne Case Images"],
    dependencies=[
        Depends(check_password_status),
        Depends(CAN_ACCESS_GYNE_CYTO_IMAGE),
    ],
)


@router.post("/{case_id}/images", response_model=GyneCaseImageResponse)
async def upload_gyne_image(
    case_id: int,
    file: UploadFile = File(...),
    description: str = Form(None),
    stain: str = Form(None),
    order: int = Form(1),
    show_in_report: bool = Form(True),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    case = db.query(GyneCytologyCase).filter(GyneCytologyCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # 🔒 เคสที่ออกผล/ยกเลิก/รออนุมัติแล้ว ห้ามแก้รูปประกอบรายงาน
    assert_gyne_case_unlocked(case)

    image_url = await save_gyne_image_local(case_id, file)

    db_image = GyneCaseImage(
        case_id=case_id,
        image_url=image_url,
        original_filename=file.filename,
        description=description,
        stain=stain,
        order=order,
        show_in_report=show_in_report,
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    return db_image


@router.get("/{case_id}/images", response_model=List[GyneCaseImageResponse])
def get_gyne_images(case_id: int, db: Session = Depends(get_db)):
    return (
        db.query(GyneCaseImage)
        .filter(GyneCaseImage.case_id == case_id)
        .order_by(GyneCaseImage.order)
        .all()
    )


@router.patch("/images/{image_id}", response_model=GyneCaseImageResponse)
def update_gyne_image(
    image_id: int,
    payload: GyneCaseImageUpdate,
    db: Session = Depends(get_db),
):
    db_image = db.query(GyneCaseImage).filter(GyneCaseImage.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")

    # 🔒 เคสที่ออกผล/ยกเลิก/รออนุมัติแล้ว ห้ามแก้รูปประกอบรายงาน
    assert_gyne_case_id_unlocked(db, db_image.case_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_image, field, value)
    db.commit()
    db.refresh(db_image)
    return db_image


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gyne_image(image_id: int, db: Session = Depends(get_db)):
    db_image = db.query(GyneCaseImage).filter(GyneCaseImage.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")

    # 🔒 เคสที่ออกผล/ยกเลิก/รออนุมัติแล้ว ห้ามแก้รูปประกอบรายงาน
    assert_gyne_case_id_unlocked(db, db_image.case_id)

    try:
        delete_gyne_image_local(db_image.image_url)
    except Exception as exc:
        logger.warning("Failed to delete gyne image file %s: %s", db_image.image_url, exc)
    db.delete(db_image)
    db.commit()
    return None


@router.put("/images/{image_id}/content", response_model=GyneCaseImageResponse)
async def replace_gyne_image_content(
    image_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Replace the stored file of an existing gyne cytology case image, keeping its row and
    all of its metadata. Backs the "re-crop / rotate / annotate an image that
    was already uploaded" flow.

    The new file is written before the old one is dropped, so a failure can
    never leave the row pointing at a file that no longer exists.
    """
    db_image = db.query(GyneCaseImage).filter(GyneCaseImage.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")

    # 🔒 เคสที่ออกผล/ยกเลิก/รออนุมัติแล้ว ห้ามแก้รูปประกอบรายงาน
    assert_gyne_case_id_unlocked(db, db_image.case_id)

    old_url = db_image.image_url
    try:
        new_url = await save_gyne_image_local(db_image.case_id, file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {e}")

    db_image.image_url = new_url
    if file.filename:
        db_image.original_filename = file.filename
    db.commit()
    db.refresh(db_image)

    if old_url and old_url != new_url:
        try:
            delete_gyne_image_local(old_url)
        except Exception as e:
            logger.warning(
                "Failed to delete replaced gyne image file %s: %s", old_url, e
            )

    return db_image
