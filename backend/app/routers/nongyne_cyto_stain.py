import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List

def _nk(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s or "")]
from app.db.database import get_db
from app.utils.slide_sticker_pdf_generator import generate_slide_sticker_pdf
from app.crud import nongyne_cyto_stain as crud
from app.schemas.nongyne_cyto_stain import (
    NongyneStainResponse,
    NongyneStainCreate,
    NongyneStainUpdate,
)
from app.models.nongyne_cyto_stain import NongyneStainRun, NongyneStainRunDetail, NongyneCytologyStain
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.patient import Patient
from app.schemas.nongyne_cyto_stain import (
    NongyneStainRunCreate,
    NongyneStainRunResponse,
    NongyneStainRunListResponse,
)
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.crud.organization import resolve_lab_short_name

router = APIRouter(
    prefix="/nongyne-stains",
    tags=["Nongyne Staining"],
    dependencies=[Depends(get_current_user)],
)


# 1. ดึงคิวงานลงทะเบียนใหม่ (เพื่อจัด Batch)
@router.get("/registered-queue", response_model=List[NongyneStainResponse])
def read_registered_queue(db: Session = Depends(get_db)):
    """
    ดึงสไลด์ status='pending' พร้อมข้อมูล Master Data (Test Name/Price)
    """
    return crud.get_registered_queue_stains(db)


# 2. ดึงสไลด์ที่รอพิมพ์ Label
@router.get("/pending-print", response_model=List[NongyneStainResponse])
def read_pending_print(db: Session = Depends(get_db)):
    """
    ดึงสไลด์ที่ is_printed=False
    """
    return crud.get_pending_print_stains(db)


# 3. ดึงสไลด์ทั้งหมดของเคส (เช่น ดูประวัติในหน้า Case Detail)
@router.get("/case/{case_id}", response_model=List[NongyneStainResponse])
def read_stains_by_case(case_id: int, db: Session = Depends(get_db)):
    return crud.get_stains_by_case(db, case_id=case_id)


# 4. สั่งย้อมเพิ่มเอง (Manual Add)
@router.post("", response_model=NongyneStainResponse)
def create_new_stain(obj_in: NongyneStainCreate, db: Session = Depends(get_db)):
    return crud.create_stain(db, obj_in=obj_in)


# 5. อัปเดตสถานะ (พิมพ์แล้ว/ย้อมแล้ว)
@router.patch("/{stain_id}", response_model=NongyneStainResponse)
def update_stain_status(
    stain_id: int, obj_in: NongyneStainUpdate, db: Session = Depends(get_db)
):
    stain = crud.update_stain(db, stain_id=stain_id, obj_in=obj_in)
    if not stain:
        raise HTTPException(status_code=404, detail="Stain not found")
    return stain


# 🚩 6. ยืนยันการส่งย้อมแบบกลุ่ม (Create Batch Run)
@router.post("/runs", response_model=NongyneStainRunResponse)
def create_nongyne_stain_run(
    obj_in: NongyneStainRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # 👈 ถ้ามีระบบ Auth
):
    """
    รับรายการ IDs และสร้างตาราง nongyne_stain_runs + nongyne_stain_run_details
    """
    # ตรวจสอบว่ามี IDs ส่งมาจริงไหม
    if not obj_in.stain_ids:
        raise HTTPException(status_code=400, detail="No stain IDs provided")

    # เรียกใช้ CRUD ที่เราออกแบบไว้สำหรับบันทึกลงตารางใหม่
    return crud.create_stain_run(
        db,
        stainer_id=obj_in.stainer_id,
        stain_ids=obj_in.stain_ids,
        run_no=obj_in.run_name,
        user_id=current_user.id,
    )


@router.get("/runs", response_model=NongyneStainRunListResponse)
def read_runs(db: Session = Depends(get_db), skip: int = 0, limit: int = 20):
    total = db.query(NongyneStainRun).count()
    items = crud.get_all_stain_runs(db, skip=skip, limit=limit)
    return {"total": total, "items": items, "skip": skip, "limit": limit}


@router.get("/runs/{run_id}/print-stickers")
def print_nongyne_run_stickers(
    run_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    from app.models.system_setting import SystemSetting as SystemSettingModel
    master = db.query(SystemSettingModel).filter(SystemSettingModel.hospital_slug == "master").first()
    sticker_w = float(master.sticker_width_cm or 2.0) if master else 2.0
    sticker_h = float(master.sticker_height_cm or 2.0) if master else 2.0
    sticker_orient = (master.sticker_orientation or "portrait") if master else "portrait"
    font_kw = {
        "font_accession": int(master.sticker_font_accession or 7) if master else 7,
        "font_block":     int(master.sticker_font_block     or 7) if master else 7,
        "font_stain":     int(master.sticker_font_stain     or 6) if master else 6,
        "font_hospital":  int(master.sticker_font_hospital  or 6) if master else 6,
        "font_date":      int(master.sticker_font_date      or 6) if master else 6,
        "margin_top_cm":   float(master.sticker_margin_top_cm or 0.0) if master else 0.0,
        "qr_scale":        float(master.sticker_qr_scale or 1.0) if master else 1.0,
        "qr_offset_x_cm":  float(master.sticker_qr_offset_x_cm or 0.0) if master else 0.0,
        "qr_offset_y_cm":  float(master.sticker_qr_offset_y_cm or 0.0) if master else 0.0,
    }

    run = (
        db.query(NongyneStainRun)
        .options(
            joinedload(NongyneStainRun.details)
            .joinedload(NongyneStainRunDetail.stain_order)
            .joinedload(NongyneCytologyStain.case)
            .joinedload(NongyneCytologyCase.patient),
            joinedload(NongyneStainRun.details)
            .joinedload(NongyneStainRunDetail.stain_order)
            .joinedload(NongyneCytologyStain.case)
            .joinedload(NongyneCytologyCase.hospital),
        )
        .filter(NongyneStainRun.id == run_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    print_data = []
    for detail in run.details:
        order = detail.stain_order
        if not order:
            continue
        order.is_printed = True
        order.printed_at = func.now()
        order.printed_by_id = current_user.id

        case = order.case
        print_data.append({
            "accession_no": (case.accession_no if case else None) or "N/A",
            "block_code": f"#{order.slide_no}" if order.slide_no else "",
            "stain_display": order.test.name if order.test else "",
            "reg_date": str(case.registered_at) if case and case.registered_at else None,
            "hospital_code": resolve_lab_short_name(case.hospital if case else None, master),
            "hn": case.hn if case else None,
            "_slide_no": order.slide_no or 0,
        })

    db.commit()
    print_data.sort(key=lambda x: (_nk(x.get("accession_no") or ""), x.get("_slide_no", 0)))
    pdf_out = generate_slide_sticker_pdf(print_data, sticker_width_cm=sticker_w, sticker_height_cm=sticker_h, sticker_orientation=sticker_orient, **font_kw)
    return Response(
        content=pdf_out,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=stickers_nongyne_{run_id}.pdf"},
    )
