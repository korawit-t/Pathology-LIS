from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.crud import he_control_slide as crud
from app.crud.organization import resolve_lab_short_name
from app.db.database import get_db
from app.dependencies.auth import get_current_user
from app.schemas.he_control_slide import HEControlSlideResponse
from app.utils.slide_sticker_pdf_generator import generate_slide_sticker_pdf

router = APIRouter(
    prefix="/he-control-slides",
    tags=["HE Control Slides"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=HEControlSlideResponse)
def create_control_slide(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return crud.create_control_slide(db, performed_by_id=current_user.id)


@router.get("", response_model=List[HEControlSlideResponse])
def list_control_slides(
    skip: int = 0,
    limit: int = 100,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    return crud.get_control_slides(
        db, skip=skip, limit=limit, date_from=date_from, date_to=date_to
    )


@router.get("/{slide_id}/print-sticker")
def print_control_slide_sticker(
    slide_id: int,
    db: Session = Depends(get_db),
):
    slide = crud.get_control_slide(db, slide_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Control slide not found")

    from app.models.system_setting import SystemSetting as SystemSettingModel

    master = (
        db.query(SystemSettingModel)
        .filter(SystemSettingModel.hospital_slug == "master")
        .first()
    )
    sticker_w = float(master.sticker_width_cm or 2.0) if master else 2.0
    sticker_h = float(master.sticker_height_cm or 2.0) if master else 2.0
    sticker_orient = (master.sticker_orientation or "portrait") if master else "portrait"
    font_kw = {
        "font_accession": int(master.sticker_font_accession or 7) if master else 7,
        "font_block": int(master.sticker_font_block or 7) if master else 7,
        "font_stain": int(master.sticker_font_stain or 6) if master else 6,
        "font_hospital": int(master.sticker_font_hospital or 6) if master else 6,
        "font_date": int(master.sticker_font_date or 6) if master else 6,
        "margin_top_cm": float(master.sticker_margin_top_cm or 0.0) if master else 0.0,
        "qr_scale": float(master.sticker_qr_scale or 1.0) if master else 1.0,
        "qr_offset_x_cm": float(master.sticker_qr_offset_x_cm or 0.0) if master else 0.0,
        "qr_offset_y_cm": float(master.sticker_qr_offset_y_cm or 0.0) if master else 0.0,
    }

    print_data = [
        {
            "accession_no": slide.control_no,
            "block_code": "CTRL",
            "stain_display": "H&E Control",
            "reg_date": str(slide.control_date),
            "hospital_code": resolve_lab_short_name(None, master),
            "hn": "",
        }
    ]

    pdf_out = generate_slide_sticker_pdf(
        print_data,
        sticker_width_cm=sticker_w,
        sticker_height_cm=sticker_h,
        sticker_orientation=sticker_orient,
        **font_kw,
    )

    return Response(
        content=pdf_out,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=he_control_{slide.control_no}.pdf"
        },
    )
