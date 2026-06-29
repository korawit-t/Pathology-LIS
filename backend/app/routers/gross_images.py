# app/routers/gross_image.py

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, status
from sqlalchemy.orm import Session
from typing import List
import logging

logger = logging.getLogger(__name__)

from app.db.database import get_db
from app.schemas.gross_image import GrossImageCreate, GrossImageResponse, GrossImageUpdate
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.gross_image import GrossImage
from app.utils.file_handler import save_gross_image_local, delete_gross_image_local
from app.dependencies.auth import get_current_user, RoleChecker
from app.core.roles import CAN_ACCESS_GROSS_IMAGE  # 🌟 นำเข้ากลุ่มสิทธิ์ที่ตั้งไว้

router = APIRouter(
    prefix="/surgical-specimens",
    tags=["Gross Images"],
    # ✅ ใช้กับทุก endpoint ใน router นี้ทันที
    dependencies=[Depends(CAN_ACCESS_GROSS_IMAGE)],
)


@router.post("/{specimen_id}/images/", response_model=GrossImageResponse)
async def upload_gross_image(
    specimen_id: int,
    file: UploadFile = File(...),
    description: str = Form(None),
    order: int = Form(1),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),  # ดึง user มาเพื่อเก็บ log ได้ถ้าต้องการ
):
    specimen = (
        db.query(SurgicalSpecimen).filter(SurgicalSpecimen.id == specimen_id).first()
    )
    if not specimen:
        raise HTTPException(status_code=404, detail="Specimen not found")

    try:
        # บันทึกไฟล์ลงใน Disk
        image_url = await save_gross_image_local(specimen_id, file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {e}")

    db_image = GrossImage(
        specimen_id=specimen_id,
        image_url=image_url,
        original_filename=file.filename,
        description=description,
        order=order,
    )

    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    return db_image


@router.get("/{specimen_id}/images/", response_model=List[GrossImageResponse])
async def get_gross_images_for_specimen(
    specimen_id: int, db: Session = Depends(get_db)
):
    specimen = (
        db.query(SurgicalSpecimen).filter(SurgicalSpecimen.id == specimen_id).first()
    )
    if not specimen:
        raise HTTPException(status_code=404, detail="Specimen not found")

    images = (
        db.query(GrossImage)
        .filter(GrossImage.specimen_id == specimen_id)
        .order_by(GrossImage.order)
        .all()
    )
    return images


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gross_image(image_id: int, db: Session = Depends(get_db)):
    db_image = db.query(GrossImage).filter(GrossImage.id == image_id).first()

    if not db_image:
        raise HTTPException(status_code=404, detail="Gross image not found")

    try:
        delete_gross_image_local(db_image.image_url)
    except Exception as e:
        # ลบไฟล์ไม่สำเร็จอาจจะบันทึก log ไว้ แต่ยังลบ record ใน DB ต่อได้
        logger.warning("Failed to delete gross image file %s: %s", db_image.image_url, e)

    db.delete(db_image)
    db.commit()
    return None


@router.patch("/images/{image_id}", response_model=GrossImageResponse)
async def update_gross_image(
    image_id: int,
    image_data: GrossImageUpdate,
    db: Session = Depends(get_db)
):
    db_image = db.query(GrossImage).filter(GrossImage.id == image_id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Gross image not found")

    update_data = image_data.model_dump(exclude_unset=True)
    if "show_in_report" in update_data:
        db_image.show_in_report = update_data["show_in_report"]

    for field, value in update_data.items():
        if field != "show_in_report":
            setattr(db_image, field, value)

    db.commit()
    db.refresh(db_image)
    return db_image
