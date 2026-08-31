import logging
from pathlib import Path
from app.utils.file_handler import (
    save_microscopic_image_local,
    delete_microscopic_image_local,
)
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List

from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.core.roles import CAN_ACCESS_MICROSCOPIC_IMAGE
from app.utils.case_lock import assert_surgical_specimen_unlocked
from app.models.user import User
from app.models.surgical_specimen import SurgicalSpecimen  # 🚩 ตรวจสอบชื่อรุ่น
from app.models.microscopic_image import MicroscopicImage
from app.schemas.microscopic_image import (
    MicroscopicImageResponse,
    MicroscopicImageCreate,
    MicroscopicImageUpdate,
)
from app.crud.microscopic_image import create_micro_image

logger = logging.getLogger(__name__)

# 🔒 SECURITY_AUDIT.md N1: every route in this router is gated by
# CAN_ACCESS_MICROSCOPIC_IMAGE — only admin / pathologist / senior_pathologist.
# Unauthenticated callers get 401; authenticated callers without the role get 403.
router = APIRouter(
    prefix="/microscopic-images",
    tags=["Microscopic Images"],
    dependencies=[Depends(CAN_ACCESS_MICROSCOPIC_IMAGE)],
)

# กำหนด Path หลัก
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR = STORAGE_DIR / "microscopic_images"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/{specimen_id}", response_model=MicroscopicImageResponse)
async def upload_micro_image(
    specimen_id: int,
    file: UploadFile = File(...),
    magnification: Optional[str] = Form(None),
    stain: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    sort_order: int = Form(1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 🔒 เคสที่ออกผล/ยกเลิก/รออนุมัติแล้ว ห้ามแก้รูปประกอบรายงาน
    assert_surgical_specimen_unlocked(db, specimen_id)

    # Validates magic bytes, enforces the size cap and strips EXIF —
    # raises HTTP 400/413 on violation.
    try:
        db_image_url = await save_microscopic_image_local(file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ไม่สามารถบันทึกไฟล์ได้: {str(e)}")

    image_in = MicroscopicImageCreate(
        image_url=db_image_url,
        original_filename=file.filename,
        magnification=magnification,
        stain=stain,
        description=description,
        sort_order=sort_order,
    )

    return create_micro_image(db, image_in, specimen_id, current_user.id)


@router.get("/get-image/{path:path}")
async def get_microscopic_image(
    path: str,
    _user=Depends(get_current_user),
):
    # ตรวจสอบ prefix เพื่อความปลอดภัย
    if not path.startswith("microscopic_images/"):
        raise HTTPException(
            status_code=403, detail="สิทธิ์การเข้าถึงจำกัดเฉพาะภาพ microscopic"
        )

    # 🔒 path-traversal protection: resolve + containment check, mirroring
    # app/routers/storage.py — a plain ".." substring blocklist doesn't
    # canonicalize symlinks or (on the on-prem Windows deploy) drive-letter
    # absolute paths, both of which pathlib's resolve()/relative_to() catch.
    resolved_storage_dir = STORAGE_DIR.resolve()
    file_path = (STORAGE_DIR / path).resolve()
    try:
        file_path.relative_to(resolved_storage_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Path ไม่ถูกต้อง")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์ภาพ")

    return FileResponse(str(file_path))


@router.get("/specimen/{specimen_id}", response_model=List[MicroscopicImageResponse])
def get_images_by_specimen(
    specimen_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(MicroscopicImage)
        .filter(MicroscopicImage.specimen_id == specimen_id)
        .all()
    )


@router.get("/case/{case_id}", response_model=List[MicroscopicImageResponse])
def get_images_by_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 🚩 แก้ไขจุดนี้: เปลี่ยนจาก SurgicalSpecimen.surgical_case_id เป็น .case_id
    images = (
        db.query(MicroscopicImage)
        .join(SurgicalSpecimen)
        .filter(SurgicalSpecimen.case_id == case_id)
        .all()
    )

    return images


@router.patch("/{image_id}", response_model=MicroscopicImageResponse)
def update_micro_image(
    image_id: int,
    image_in: MicroscopicImageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. ค้นหาข้อมูลเดิม
    db_image = (
        db.query(MicroscopicImage).filter(MicroscopicImage.id == image_id).first()
    )
    if not db_image:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลภาพที่ต้องการแก้ไข")

    # 🔒 เคสที่ออกผล/ยกเลิก/รออนุมัติแล้ว ห้ามแก้รูปประกอบรายงาน
    assert_surgical_specimen_unlocked(db, db_image.specimen_id)

    # 2. เตรียมข้อมูลที่จะ Update (กรองเอาเฉพาะฟิลด์ที่ส่งมา)
    update_data = image_in.model_dump(exclude_unset=True)

    # 3. วนลูป Update ฟิลด์ใน Database Object
    for field, value in update_data.items():
        if field == "show_in_report":
            db_image.show_in_report = value
        else:
            setattr(db_image, field, value)

    # 4. บันทึกและ Refresh
    db.add(db_image)
    db.commit()
    db.refresh(db_image)

    return db_image


@router.delete("/{image_id}")
def delete_micro_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    image = db.query(MicroscopicImage).filter(MicroscopicImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลภาพ")

    # 🔒 เคสที่ออกผล/ยกเลิก/รออนุมัติแล้ว ห้ามแก้รูปประกอบรายงาน
    assert_surgical_specimen_unlocked(db, image.specimen_id)

    try:
        delete_microscopic_image_local(image.image_url)
    except Exception as e:
        # A missing file is no reason to leave an orphaned DB row behind.
        logger.warning(
            "Failed to delete microscopic image file %s: %s", image.image_url, e
        )

    db.delete(image)
    db.commit()
    return {"detail": "ลบรูปภาพสำเร็จ"}


@router.put("/{image_id}/content", response_model=MicroscopicImageResponse)
async def replace_micro_image_content(
    image_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Replace the stored file of an existing microscopic image, keeping its row,
    its specimen link and all of its metadata. Backs the "re-crop / rotate /
    annotate an already-uploaded image" flow.

    The new file is written before the old one is dropped, so a failure can
    never leave the row pointing at a file that no longer exists.
    """
    db_image = (
        db.query(MicroscopicImage).filter(MicroscopicImage.id == image_id).first()
    )
    if not db_image:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลภาพที่ต้องการแก้ไข")

    # 🔒 เคสที่ออกผล/ยกเลิก/รออนุมัติแล้ว ห้ามแก้รูปประกอบรายงาน
    assert_surgical_specimen_unlocked(db, db_image.specimen_id)

    old_url = db_image.image_url
    try:
        new_url = await save_microscopic_image_local(file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ไม่สามารถบันทึกไฟล์ได้: {str(e)}")

    db_image.image_url = new_url
    if file.filename:
        db_image.original_filename = file.filename
    db.add(db_image)
    db.commit()
    db.refresh(db_image)

    if old_url and old_url != new_url:
        try:
            delete_microscopic_image_local(old_url)
        except Exception as e:
            logger.warning(
                "Failed to delete replaced microscopic image file %s: %s", old_url, e
            )

    return db_image
