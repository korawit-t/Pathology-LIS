import re
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from io import BytesIO

def _nk(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s or "")]
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from pydantic import BaseModel

from app.db.database import get_db
from app.schemas.surgical_block_stain import (
    StainResponse,
    StainCreate,
    StainUpdate,
    StainShortResponse,
    StainingRunResponse,
    OutlabRunCreate,
    OutlabRunUpdate,
    OutlabRunResponse,
    OutlabRunReceiveDetails,
)
from app.crud import surgical_block_stain as crud
from app.dependencies.auth import get_current_user, RoleChecker
from app.models.surgical_block_stain import SurgicalStainRun, SurgicalStainRunDetail
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.surgical_case import SurgicalCase
from app.models.surgical_block_stain import SurgicalBlockStain
from app.utils.slide_sticker_pdf_generator import generate_slide_sticker_pdf
from app.crud.organization import resolve_lab_short_name
from app.core.roles import CAN_ACCESS_SURGICAL_BLOCK

router = APIRouter(
    prefix="/surgical-block-stains",
    tags=["Surgical Block Stains"],
    dependencies=[Depends(CAN_ACCESS_SURGICAL_BLOCK)],
)

# --- 1. Static Paths (วางไว้บนสุดเสมอ) ---


@router.get("/recut-count")
def get_recut_count(db: Session = Depends(get_db)):
    return {"count": db.query(SurgicalBlockStain).filter(SurgicalBlockStain.is_recut == True, SurgicalBlockStain.status == "pending").count()}


@router.get("", response_model=List[StainShortResponse])
def read_stains(skip: int = 0, limit: int = 100, status: str = None, is_external: bool = None, category: str = None, db: Session = Depends(get_db)):
    return crud.get_stains(db, skip=skip, limit=limit, status=status, is_external=is_external, category=category)


@router.get("/pending-tree")
def read_stains_tree(
    test_id: int = None, db: Session = Depends(get_db)
):
    if not test_id:
        return []
    return crud.get_stains_tree(db, status="pending", test_id=test_id)


@router.get("/ready-additional")
def read_additional_stains_by_case(
    pathologist_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """All non-HE stains (IHC / Special stain) grouped by case, all statuses."""
    return crud.get_additional_stains_by_case(db, pathologist_id=pathologist_id)


# 2. API ดึงรายการ Run (รอบการย้อม)
@router.get("/runs", response_model=List[StainingRunResponse])
def read_stain_runs(db: Session = Depends(get_db)):
    from app.crud import stain_run as run_crud

    # แม้ใน DB จะมีข้อมูลเยอะ แต่ JSON จะโชว์แค่ตามที่ StainingRunResponse กำหนด
    return run_crud.list_active_runs(db)

# --- Outlab Runs ---
@router.post("/outlab-runs", response_model=OutlabRunResponse)
def create_outlab_run(
    obj_in: OutlabRunCreate, 
    db: Session = Depends(get_db), 
    current_user=Depends(get_current_user)
):
    return crud.create_outlab_run(db, obj_in=obj_in, user_id=current_user.id)

@router.get("/outlab-runs", response_model=List[OutlabRunResponse])
def read_outlab_runs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_outlab_runs(db, skip=skip, limit=limit)

@router.patch("/outlab-runs/{run_id}", response_model=OutlabRunResponse)
def update_outlab_run(
    run_id: int,
    obj_in: OutlabRunUpdate,
    db: Session = Depends(get_db),
):
    result = crud.update_outlab_run(db, run_id=run_id, obj_in=obj_in)
    if not result:
        raise HTTPException(status_code=404, detail="Outlab run not found")
    return result

@router.patch("/outlab-runs/{run_id}/receive", response_model=OutlabRunResponse)
def receive_outlab_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = crud.receive_outlab_run(db, run_id=run_id, user_id=current_user.id)
    if not result:
        raise HTTPException(status_code=404, detail="Outlab run not found")
    return result

@router.patch("/outlab-runs/{run_id}/receive-details", response_model=OutlabRunResponse)
def receive_outlab_run_details(
    run_id: int,
    payload: OutlabRunReceiveDetails,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = crud.receive_outlab_run_details(
        db, run_id=run_id, user_id=current_user.id, detail_ids=payload.detail_ids
    )
    if not result:
        raise HTTPException(status_code=404, detail="Outlab run not found")
    return result

@router.patch("/outlab-run-details/{detail_id}/hosxp-key")
def toggle_hosxp_keyed(
    detail_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = crud.toggle_hosxp_keyed(db, detail_id=detail_id, keyed=payload.get("keyed", True))
    if result is None:
        raise HTTPException(status_code=404, detail="Outlab run detail not found")
    return result


@router.delete("/outlab-runs/{run_id}")
def delete_outlab_run(run_id: int, db: Session = Depends(get_db)):
    success = crud.delete_outlab_run(db, run_id=run_id)
    if not success:
        raise HTTPException(status_code=404, detail="Outlab run not found")
    return {"message": "Outlab run deleted successfully"}

@router.post("", response_model=StainResponse)
def create_stain(obj_in: StainCreate, db: Session = Depends(get_db)):
    from app.models.anatomical_pathology_test import AnatomicalPathologyTest
    # Auto-fill test_id for recut orders using the stable system_code
    if obj_in.is_recut and obj_in.test_id is None:
        he_recut = (
            db.query(AnatomicalPathologyTest)
            .filter(AnatomicalPathologyTest.system_code == "HE_RECUT")
            .first()
        )
        if he_recut:
            obj_in = obj_in.model_copy(update={"test_id": he_recut.id})
    return crud.create_stain(db, obj_in=obj_in)


@router.post("/batch-run")
def create_stain_batch_run(
    payload: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.crud import stain_run as run_crud

    return run_crud.create_he_batch_run(db, obj_in=payload, operator_id=current_user.id)


# --- 2. Dynamic Paths (Path ที่มี {variable} ต้องอยู่ล่างสุด) ---


@router.put("/{stain_id}", response_model=StainResponse)
def update_stain(
    stain_id: int,
    obj_in: StainUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_obj = crud.update_stain(db, stain_id=stain_id, obj_in=obj_in, user_id=current_user.id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Stain not found")
    return db_obj


@router.delete("/{stain_id}")
def delete_stain(stain_id: int, db: Session = Depends(get_db)):
    success = crud.delete_stain(db, stain_id=stain_id)
    if not success:
        raise HTTPException(status_code=404, detail="Stain not found")
    return {"message": "Deleted successfully"}


@router.get("/run/{run_id}/print-stickers")
def print_stain_run_stickers(
    run_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    from app.models.system_setting import SystemSetting as SystemSettingModel
    master = db.query(SystemSettingModel).filter(SystemSettingModel.hospital_slug == "master").first()
    sticker_w = float(master.sticker_width_cm or 2.0) if master else 2.0
    sticker_h = float(master.sticker_height_cm or 2.0) if master else 2.0
    sticker_orient = (master.sticker_orientation or "portrait") if master else "portrait"
    font_kw = {
        "font_accession":  int(master.sticker_font_accession or 7) if master else 7,
        "font_block":      int(master.sticker_font_block     or 7) if master else 7,
        "font_stain":      int(master.sticker_font_stain     or 6) if master else 6,
        "font_hospital":   int(master.sticker_font_hospital  or 6) if master else 6,
        "font_date":       int(master.sticker_font_date      or 6) if master else 6,
        "margin_top_cm":   float(master.sticker_margin_top_cm or 0.0) if master else 0.0,
        "qr_scale":        float(master.sticker_qr_scale or 1.0) if master else 1.0,
        "qr_offset_x_cm":  float(master.sticker_qr_offset_x_cm or 0.0) if master else 0.0,
        "qr_offset_y_cm":  float(master.sticker_qr_offset_y_cm or 0.0) if master else 0.0,
    }

    # 1. ดึงข้อมูลจาก Database
    run = (
        db.query(SurgicalStainRun)
        .options(
            joinedload(SurgicalStainRun.details)
            .joinedload(SurgicalStainRunDetail.stain_order)
            .joinedload(SurgicalBlockStain.test),  # <--- โหลด Master Data มาด้วย
            joinedload(SurgicalStainRun.details)
            .joinedload(SurgicalStainRunDetail.stain_order)
            .joinedload(SurgicalBlockStain.block)
            .joinedload(SurgicalBlock.specimen)
            .joinedload(SurgicalSpecimen.case)
            .joinedload(SurgicalCase.hospital),
        )
        .filter(SurgicalStainRun.id == run_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # 2. เตรียม List ของข้อมูลที่จะส่งให้ Generator
    print_data = []

    for detail in run.details:
        order = detail.stain_order
        if not order:
            continue

        # --- อัปเดตสถานะการพิมพ์ใน Database ---
        order.is_printed = True
        order.printed_at = func.now()
        order.printed_by_id = current_user.id

        # --- เตรียมข้อมูลสำหรับการวาด PDF ---
        stain_display = order.test.name if order.test else "Unknown"

        block = order.block
        specimen = block.specimen if block else None
        case = specimen.case if specimen else None
        reg_date = str(case.registered_at) if case and case.registered_at else None

        print_data.append(
            {
                "accession_no": detail.accession_no or "N/A",
                "block_code": detail.block_code or "N/A",
                "stain_display": stain_display,
                "reg_date": reg_date,
                "hospital_code": resolve_lab_short_name(case.hospital if case else None, master),
                "hn": case.hn if case else None,
            }
        )

    # 3. ยืนยันการอัปเดตสถานะลง DB
    db.commit()

    print_data.sort(key=lambda x: (_nk(x.get("accession_no") or ""), _nk(x.get("block_code") or "")))

    # 4. เรียกใช้ Utility เพื่อสร้าง PDF (รวบรวมทุกแผ่นไว้ในไฟล์เดียว)
    pdf_out = generate_slide_sticker_pdf(print_data, sticker_width_cm=sticker_w, sticker_height_cm=sticker_h, sticker_orientation=sticker_orient, **font_kw)

    return Response(
        content=pdf_out,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=stickers_run_{run_id}.pdf"},
    )


@router.delete("/runs/{run_id}")
def delete_stain_run(run_id: int, db: Session = Depends(get_db)):
    success = crud.delete_staining_run(db, run_id=run_id)
    if not success:
        raise HTTPException(status_code=404, detail="ไม่พบรายการรอบการย้อมที่ระบุ")
    return {"message": "ลบรายการและคืนค่าสถานะสไลด์เรียบร้อยแล้ว"}


# --- แก้ไขฟังก์ชัน Get Blocks ---
@router.get("/stain-orders/{accession_no}")
async def get_stain_orders_by_accession(
    accession_no: str, db: Session = Depends(get_db)
):
    from app.models.surgical_block_stain import SurgicalBlockStain
    from app.models.surgical_block import SurgicalBlock
    from app.models.surgical_specimen import SurgicalSpecimen
    from app.models.surgical_case import SurgicalCase
    from app.models.anatomical_pathology_test import AnatomicalPathologyTest

    stains = (
        db.query(SurgicalBlockStain)
        .options(joinedload(SurgicalBlockStain.test))
        .join(SurgicalBlock)
        .join(SurgicalSpecimen)
        .join(SurgicalCase)
        .join(AnatomicalPathologyTest, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
        .filter(
            SurgicalCase.accession_no == accession_no,
            AnatomicalPathologyTest.system_code == "HE_ROUTINE",
        )
        .all()
    )

    if not stains:
        return []

    return [
        {
            "id": s.id,
            "block_id": s.block_id,
            "block_code": s.block.block_code if s.block else None,
            "accession_no": accession_no,
            "stain_type": s.test.name if s.test else None,
            "test_name": s.test.name if s.test else None,
            "is_printed": s.is_printed,
            "status": s.status,
            "slide_no": 1,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in stains
    ]


class QuickPrintRequest(BaseModel):
    stain_ids: List[int]


@router.post("/mark-printed")
def mark_stains_printed(
    request: QuickPrintRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.models.surgical_block_stain import SurgicalBlockStain
    stains = db.query(SurgicalBlockStain).filter(SurgicalBlockStain.id.in_(request.stain_ids)).all()
    for s in stains:
        s.is_printed = True
        s.printed_at = func.now()
        s.printed_by_id = current_user.id
    db.commit()
    return {"updated": len(stains)}


@router.post("/print-he-quick")
def print_quick_stickers(
    request: QuickPrintRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # 2. ค้นหาคำสั่งย้อมทั้งหมดที่อยู่ในรายการ IDs ที่ส่งมา
    stain_orders = (
        db.query(SurgicalBlockStain)
        .options(
            joinedload(SurgicalBlockStain.test),
            joinedload(SurgicalBlockStain.block)
            .joinedload(SurgicalBlock.specimen)
            .joinedload(SurgicalSpecimen.case)
            .joinedload(SurgicalCase.hospital),
        )
        .filter(SurgicalBlockStain.id.in_(request.stain_ids))
        .all()
    )

    if not stain_orders:
        raise HTTPException(status_code=404, detail="No stain orders found")

    from app.models.system_setting import SystemSetting as SystemSettingModel
    master = db.query(SystemSettingModel).filter(SystemSettingModel.hospital_slug == "master").first()
    sticker_w = float(master.sticker_width_cm or 2.0) if master else 2.0
    sticker_h = float(master.sticker_height_cm or 2.0) if master else 2.0
    sticker_orient = (master.sticker_orientation or "portrait") if master else "portrait"
    font_kw = {
        "font_accession":  int(master.sticker_font_accession or 7) if master else 7,
        "font_block":      int(master.sticker_font_block     or 7) if master else 7,
        "font_stain":      int(master.sticker_font_stain     or 6) if master else 6,
        "font_hospital":   int(master.sticker_font_hospital  or 6) if master else 6,
        "font_date":       int(master.sticker_font_date      or 6) if master else 6,
        "margin_top_cm":   float(master.sticker_margin_top_cm or 0.0) if master else 0.0,
        "qr_scale":        float(master.sticker_qr_scale or 1.0) if master else 1.0,
        "qr_offset_x_cm":  float(master.sticker_qr_offset_x_cm or 0.0) if master else 0.0,
        "qr_offset_y_cm":  float(master.sticker_qr_offset_y_cm or 0.0) if master else 0.0,
    }

    data_to_print = []
    for order in stain_orders:
        order.is_printed = True
        order.printed_at = func.now()
        order.printed_by_id = current_user.id

        block = order.block
        specimen = block.specimen if block else None
        case = specimen.case if specimen else None
        reg_date = str(case.registered_at) if case and case.registered_at else None

        data_to_print.append(
            {
                "accession_no": case.accession_no if case else "N/A",
                "block_code": block.block_code if block else "N/A",
                "stain_display": order.test.name if order.test else "Unknown",
                "reg_date": reg_date,
                "hospital_code": resolve_lab_short_name(case.hospital if case else None, master),
                "hn": case.hn if case else None,
            }
        )

    # 4. บันทึกการเปลี่ยนแปลงทั้งหมดลง DB (ทำทีเดียวหลังจบลูป)
    db.commit()

    # 5. สร้าง PDF ที่มีสติกเกอร์ครบทุกดวงที่เลือก
    pdf_out = generate_slide_sticker_pdf(data_to_print, sticker_width_cm=sticker_w, sticker_height_cm=sticker_h, sticker_orientation=sticker_orient, **font_kw)

    return Response(
        content=pdf_out,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=quick_batch_print.pdf"},
    )
