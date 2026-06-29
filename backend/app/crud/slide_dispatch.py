from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from datetime import datetime
from app.utils.time import local_now
from app.models.surgical_case import SurgicalCase
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_cyto_stain import NongyneCytologyStain
from app.models.slide_dispatch import SlideDispatchItem, SlideDispatchRun

# เพิ่ม Schema สำหรับรับข้อมูลแบบ Bulk
from app.schemas.slide_dispatch import SlideDispatchBulkCreate

# สร้าง Mapping เพื่อความง่ายในการขยายระบบในอนาคต
CASE_MODEL_MAP = {
    "SURGICAL": SurgicalCase,
    "NONGYNE_CYTO": NongyneCytologyCase,
}


def generate_dispatch_no(db: Session):
    today = local_now().strftime("%Y%m%d")  # DS20260120
    prefix = f"DS{today}"

    # หาเลขล่าสุดของวันนี้
    last_run = (
        db.query(SlideDispatchRun)
        .filter(SlideDispatchRun.dispatch_no.like(f"{prefix}%"))
        .order_by(SlideDispatchRun.dispatch_no.desc())
        .first()
    )

    if last_run:
        last_no = int(last_run.dispatch_no[-4:])
        new_no = f"{prefix}{(last_no + 1):04d}"
    else:
        new_no = f"{prefix}0001"
    return new_no


def verify_accession_for_dispatch(db: Session, accession_no: str):
    """
    🚩 ตรวจสอบ Accession No. ก่อนนำเข้าตารางสแกนใน Frontend
    เช็คว่ามีเคสอยู่จริง และสถานะต้องเป็น 'stained' (Surgical) หรือสถานะที่เหมาะสม (Gyne)
    """
    # 1. ลองหาใน Surgical Case ก่อน
    surgical_case = (
        db.query(SurgicalCase).filter(SurgicalCase.accession_no == accession_no).first()
    )

    if surgical_case:
        # Allow dispatch when H&E staining is complete (is_slide_prepped=True or status="stained")
        if not surgical_case.is_slide_prepped and surgical_case.status != "stained":
            raise HTTPException(
                status_code=400,
                detail=f"เคส {accession_no} (Surgical) อยู่ในสถานะ '{surgical_case.status}' ไม่สามารถส่งสไลด์ได้ (H&E ยังไม่เสร็จ)",
            )
        surgical_case_with_blocks = (
            db.query(SurgicalCase)
            .options(
                selectinload(SurgicalCase.specimens).selectinload(SurgicalSpecimen.blocks)
            )
            .filter(SurgicalCase.id == surgical_case.id)
            .first()
        )
        specimens_data = [
            {
                "id": spec.id,
                "blocks": [{"id": b.id, "block_code": b.block_code} for b in (spec.blocks or [])],
            }
            for spec in (surgical_case_with_blocks.specimens or [])
        ]
        return {
            "id": surgical_case.id,
            "accession_no": surgical_case.accession_no,
            "patient_name": surgical_case.patient.name,
            "case_type": "SURGICAL",
            "specimens": specimens_data,
        }

    # 2. ลองหาใน Non-Gyne Cytology Case
    nongyne_case = (
        db.query(NongyneCytologyCase)
        .filter(NongyneCytologyCase.accession_no == accession_no)
        .first()
    )

    if nongyne_case:
        stain_ready = db.query(NongyneCytologyStain).filter(
            NongyneCytologyStain.case_id == nongyne_case.id,
            NongyneCytologyStain.status.in_(["stained", "completed"]),
        ).first()
        if not stain_ready:
            raise HTTPException(
                status_code=400,
                detail=f"เคส {accession_no} (Non-Gyne) ยังไม่ผ่านขั้นตอน Staining ไม่สามารถส่งสไลด์ได้",
            )
        return {
            "id": nongyne_case.id,
            "accession_no": nongyne_case.accession_no,
            "patient_name": nongyne_case.patient.name,
            "case_type": "NONGYNE_CYTO",
        }

    # 4. ถ้าไม่เจอเลย
    raise HTTPException(status_code=404, detail=f"ไม่พบเคส {accession_no} ในระบบ")


def create_bulk_slide_dispatch(
    db: Session, obj_in: SlideDispatchBulkCreate, sender_id: int
):
    """
    สร้างใบส่งสไลด์ (Run) และรายการเคส (Items) พร้อมกัน
    """
    try:
        # 1. สร้าง Header (SlideDispatchRun)
        db_run = SlideDispatchRun(
            dispatch_no=generate_dispatch_no(db),
            sender_id=sender_id,
            pathologist_id=obj_in.pathologist_id,
            remark=obj_in.remark,
            total_cases=len(obj_in.items),
        )
        db.add(db_run)
        db.flush()  # ดึง id ของ db_run มาใช้ก่อน commit

        # 2. สร้าง Items และอัปเดตสถานะในตารางเคสหลัก
        for item in obj_in.items:
            db_item = SlideDispatchItem(
                run_id=db_run.id,
                case_id=item.case_id,
                case_type=item.case_type,
                status="slide sent",
            )
            db.add(db_item)

            # อัปเดตตาราง SurgicalCase
            if item.case_type == "SURGICAL":
                target_case = db.query(SurgicalCase).get(item.case_id)
                if target_case:
                    target_case.status = "slide sent"
                    target_case.pathologist_id = obj_in.pathologist_id
            
            # อัปเดตตาราง NongyneCytologyCase
            elif item.case_type == "NONGYNE_CYTO":
                target_case = db.query(NongyneCytologyCase).get(item.case_id)
                if target_case:
                    target_case.status = "slide sent"
                    target_case.pathologist_id = obj_in.pathologist_id

        db.commit()
        db.refresh(db_run)
        return db_run

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Failed to create dispatch: {str(e)}"
        )


def get_slide_dispatches(db: Session, skip: int = 0, limit: int = 100, pathologist_id: int = None):
    """
    ดึงรายการใบส่งสไลด์ (Runs) แบบแบ่งหน้า
    """
    query = db.query(SlideDispatchRun)
    if pathologist_id is not None:
        query = query.filter(SlideDispatchRun.pathologist_id == pathologist_id)
    total_count = query.count()

    items = (
        query.options(
            joinedload(SlideDispatchRun.sender),
            joinedload(SlideDispatchRun.pathologist),
            # โหลด items และทะลุไปถึง SurgicalCase/Specimens/Blocks
            selectinload(SlideDispatchRun.items)
            .joinedload(SlideDispatchItem.surgical_case)
            .selectinload(SurgicalCase.specimens)
            .selectinload(SurgicalSpecimen.blocks),
            selectinload(SlideDispatchRun.items)
            .joinedload(SlideDispatchItem.nongyne_cyto_case),
        )
        .order_by(SlideDispatchRun.sent_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {"total": total_count, "items": items, "skip": skip, "limit": limit}


def delete_slide_dispatch(db: Session, run_id: int):
    """
    ยกเลิกทั้งใบส่งสไลด์: ลบ Run และ Items พร้อม Reset สถานะเคสทั้งหมดในใบนั้น
    """
    db_run = db.query(SlideDispatchRun).filter(SlideDispatchRun.id == run_id).first()
    if not db_run:
        return False

    try:
        # 1. วนลูปคืนค่าสถานะให้ทุกเคสที่อยู่ในใบนี้
        for item in db_run.items:
            if item.case_type == "SURGICAL":
                target_case = db.query(SurgicalCase).get(item.case_id)
                if target_case:
                    target_case.status = "stained"
                    target_case.pathologist_id = None
            
            elif item.case_type == "NONGYNE_CYTO":
                target_case = db.query(NongyneCytologyCase).get(item.case_id)
                if target_case:
                    target_case.status = "stained"
                    target_case.pathologist_id = None

        # 2. ลบ db_run (Cascade จะลบ items ให้อัตโนมัติถ้าตั้งค่าไว้ใน Model)
        db.delete(db_run)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
