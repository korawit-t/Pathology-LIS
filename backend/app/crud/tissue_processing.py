from sqlalchemy.orm import Session, joinedload
from app.models.tissue_processing import TissueProcessingRun, TissueProcessingItem, ProcessorMachine, ProcessingProgram
from app.schemas.tissue_processing import TissueProcessingRunCreate, ProcessorMachineCreate, ProcessorMachineUpdate, ProcessingProgramCreate, ProcessingProgramUpdate
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_specimen import SurgicalSpecimen
from datetime import datetime
from app.utils.time import local_now
from fastapi import HTTPException

# --- Machine CRUD ---
def get_processor_machines(db: Session, skip: int = 0, limit: int = 100):
    return db.query(ProcessorMachine).offset(skip).limit(limit).all()

def create_processor_machine(db: Session, obj_in: ProcessorMachineCreate):
    db_obj = ProcessorMachine(**obj_in.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_processor_machine(db: Session, machine_id: int, obj_in: ProcessorMachineUpdate):
    db_obj = db.query(ProcessorMachine).filter(ProcessorMachine.id == machine_id).first()
    if not db_obj: return None
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_processor_machine(db: Session, machine_id: int):
    db_obj = db.query(ProcessorMachine).filter(ProcessorMachine.id == machine_id).first()
    if not db_obj: return False
    db.delete(db_obj)
    db.commit()
    return True

# --- Program CRUD ---
def get_processing_programs(db: Session, skip: int = 0, limit: int = 100):
    return db.query(ProcessingProgram).offset(skip).limit(limit).all()

def create_processing_program(db: Session, obj_in: ProcessingProgramCreate):
    db_obj = ProcessingProgram(**obj_in.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_processing_program(db: Session, program_id: int, obj_in: ProcessingProgramUpdate):
    db_obj = db.query(ProcessingProgram).filter(ProcessingProgram.id == program_id).first()
    if not db_obj: return None
    update_data = obj_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_processing_program(db: Session, program_id: int):
    db_obj = db.query(ProcessingProgram).filter(ProcessingProgram.id == program_id).first()
    if not db_obj: return False
    db.delete(db_obj)
    db.commit()
    return True


def generate_run_number(db: Session):
    """
    สร้างรหัสรันอัตโนมัติ Format: PR-YYYYMMDD-XX
    """
    today_str = local_now().strftime("%Y%m%d")
    prefix = f"PR-{today_str}"

    # ค้นหารายการล่าสุดของวันนี้เพื่อรันเลขต่อ
    last_run = (
        db.query(TissueProcessingRun)
        .filter(TissueProcessingRun.run_number.like(f"{prefix}%"))
        .order_by(TissueProcessingRun.run_number.desc())
        .first()
    )

    if not last_run:
        return f"{prefix}-01"

    try:
        # ตัดเลข sequence 2 ตัวท้ายออกมาบวกเพิ่ม
        last_seq = int(last_run.run_number.split("-")[-1])
        new_seq = last_seq + 1
        return f"{prefix}-{new_seq:02d}"
    except (ValueError, IndexError):
        return f"{prefix}-01"


def create_processing_run(db: Session, obj_in: TissueProcessingRunCreate):
    # 1. ตรวจสอบสถานะ (เหมือนเดิม)
    blocks_to_update = (
        db.query(SurgicalBlock)
        .filter(
            SurgicalBlock.id.in_(obj_in.block_ids), SurgicalBlock.status != "grossed"
        )
        .all()
    )

    if blocks_to_update:
        invalid_codes = [f"{b.specimen_label}{b.block_no}" for b in blocks_to_update]
        raise HTTPException(
            status_code=400, detail=f"ตลับสถานะไม่ถูกต้อง: {', '.join(invalid_codes)}"
        )

    auto_run_no = generate_run_number(db)

    # 3. สร้าง Instance แบบว่างเปล่าก่อนเพื่อเลี่ยง TypeError ใน Constructor
    db_run = TissueProcessingRun()

    # กำหนดค่าทีละตัว (Manual Assignment)
    db_run.run_number = auto_run_no
    db_run.processor_name = obj_in.processor_name
    db_run.program_name = obj_in.program_name
    db_run.start_at = obj_in.start_at
    db_run.created_by_id = obj_in.created_by_id
    db_run.remark = obj_in.remark
    db_run.status = obj_in.status or "processing"

    # บรรทัดนี้จะทดสอบว่า Model รู้จักฟิลด์นี้จริงไหม
    try:
        db_run.block_in_total = len(obj_in.block_ids)
    except AttributeError:
        # หากยังไม่ได้ แสดงว่า Model ที่ถูกโหลดเข้ามาไม่มีฟิลด์นี้จริงๆ
        raise HTTPException(
            status_code=500,
            detail="Model mismatch: 'block_in_total' not found in loaded Class",
        )

    try:
        db.add(db_run)
        db.flush()

        if obj_in.block_ids:
            items = [
                TissueProcessingItem(
                    run_id=db_run.id, block_id=b_id, status="in_machine"
                )
                for b_id in obj_in.block_ids
            ]
            db.add_all(items)

            db.query(SurgicalBlock).filter(
                SurgicalBlock.id.in_(obj_in.block_ids)
            ).update({"status": "processing"}, synchronize_session=False)

        db.commit()
        db.refresh(db_run)
        return db_run
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")


def get_processing_runs(
    db: Session, skip: int = 0, limit: int = 100, status: str = None
):
    query = db.query(TissueProcessingRun)

    if status:
        query = query.filter(TissueProcessingRun.status == status)

    return (
        query.options(
            joinedload(TissueProcessingRun.items)
            .joinedload(TissueProcessingItem.block)
            .joinedload(SurgicalBlock.specimen),  # ✅ เชื่อมต่อกันเป็นทอดๆ แบบนี้
            joinedload(TissueProcessingRun.creator),
            joinedload(TissueProcessingRun.completer),
        )
        .order_by(TissueProcessingRun.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_processing_run_by_id(db: Session, run_id: int):
    return (
        db.query(TissueProcessingRun).filter(TissueProcessingRun.id == run_id).first()
    )


def update_run(db: Session, run_id: int, obj_in):
    db_run = db.query(TissueProcessingRun).filter(TissueProcessingRun.id == run_id).first()
    if not db_run:
        return None

    data = obj_in.model_dump(exclude_unset=True)
    block_ids = data.pop("block_ids", None)

    for field, value in data.items():
        setattr(db_run, field, value)

    if block_ids is not None:
        existing_items = db.query(TissueProcessingItem).filter(TissueProcessingItem.run_id == run_id).all()
        existing_block_ids = {item.block_id for item in existing_items}
        new_block_ids = set(block_ids)

        removed_ids = existing_block_ids - new_block_ids
        added_ids = new_block_ids - existing_block_ids

        if removed_ids:
            db.query(TissueProcessingItem).filter(
                TissueProcessingItem.run_id == run_id,
                TissueProcessingItem.block_id.in_(removed_ids),
            ).delete(synchronize_session=False)
            db.query(SurgicalBlock).filter(SurgicalBlock.id.in_(removed_ids)).update(
                {"status": "grossed"}, synchronize_session=False
            )

        if added_ids:
            new_items = [TissueProcessingItem(run_id=run_id, block_id=b_id, status="in_machine") for b_id in added_ids]
            db.add_all(new_items)
            db.query(SurgicalBlock).filter(SurgicalBlock.id.in_(added_ids)).update(
                {"status": "processing"}, synchronize_session=False
            )

        db_run.block_in_total = len(new_block_ids)

    db.commit()
    db.refresh(db_run)
    return db_run


def update_run_status(
    db: Session,
    run_id: int,
    status: str,
    user_id: int = None,
    block_out_total: int = None,
    confirmed_block_ids: list[int] = None,
):
    db_run = (
        db.query(TissueProcessingRun).filter(TissueProcessingRun.id == run_id).first()
    )
    if not db_run:
        return None

    if status == "completed":
        # 🌟 เพิ่ม confirmed_block_ids ตรงนี้เพื่อให้ค่าส่งไปถึงฟังก์ชันข้างล่าง
        return complete_processing_run(
            db, run_id, user_id, block_out_total, confirmed_block_ids
        )

    db_run.status = status
    db.commit()
    db.refresh(db_run)
    return db_run


def get_pending_blocks_tree(db: Session):
    all_blocks = (
        db.query(SurgicalBlock)
        .join(SurgicalSpecimen)
        .options(joinedload(SurgicalBlock.specimen).joinedload(SurgicalSpecimen.case))
        .filter(SurgicalBlock.status == "grossed")
        .order_by(
            SurgicalSpecimen.case_id.asc(),  # 🌟 เรียงตามเคสก่อน
            SurgicalSpecimen.specimen_label.asc(),  # 🌟 แล้วค่อยเรียง A, B, C
            SurgicalBlock.block_no.asc(),
        )
        .all()
    )

    case_map = {}
    for block in all_blocks:
        spec_obj = block.specimen
        if not spec_obj or not spec_obj.case:
            continue

        case_obj = spec_obj.case
        case_id = case_obj.id

        # 1. ถ้ายังไม่มี Case นี้ใน map ให้สร้างหัวข้อ Case ใหญ่
        if case_id not in case_map:
            case_map[case_id] = {
                "key": f"case-{case_id}",  # 🌟 เปลี่ยน prefix เป็น case-
                "code": case_obj.accession_no,
                "isCase": True,
                "children": [],
            }

        # 2. ใส่ Block ลงไปใน children ของ Case นี้เลย (ไม่ต้องแยก Specimen node ก็ได้เพื่อให้เลือกง่าย)
        case_map[case_id]["children"].append(
            {
                "key": block.id,
                "id": block.id,
                "code": f"{block.block_code}",  # แสดงแค่ "A1", "B2" เพราะหัวข้อใหญ่บอก Accession No แล้ว
                "full_code": f"{case_obj.accession_no} {block.block_code}",  # เก็บไว้ใช้ตอนแสดงผล
                "isCase": False,
                "is_decal": getattr(block, "is_decal", False),
                "decal_end_at": (
                    block.decal_end_at.isoformat()
                    if getattr(block, "decal_end_at", None)
                    else None
                ),
            }
        )

    return list(case_map.values())


def complete_processing_run(
    db: Session,
    run_id: int,
    user_id: int = None,
    block_out_total: int = None,
    confirmed_block_ids: list[int] = None,
):
    """
    confirmed_block_ids: รายการ ID ของตลับที่สแกนออกจริง (ถ้ามีระบบสแกนออก)
    """
    db_run = (
        db.query(TissueProcessingRun).filter(TissueProcessingRun.id == run_id).first()
    )
    if not db_run:
        return None

    try:
        # 1. อัปเดตข้อมูลภาพรวมของ Run
        db_run.status = "completed"
        db_run.completed_at = local_now()
        db_run.completed_by_id = user_id
        db_run.block_out_total = (
            block_out_total if block_out_total is not None else db_run.block_in_total
        )

        # 2. ดึงรายการ Items ทั้งหมดใน Run
        items = (
            db.query(TissueProcessingItem)
            .filter(TissueProcessingItem.run_id == run_id)
            .all()
        )

        # 3. จัดการสถานะรายตลับ (Out Detail)
        all_item_block_ids = [item.block_id for item in items]

        # กรณีมีการส่งรายการตลับที่สแกนออกจริงมา (confirmed_block_ids)
        if confirmed_block_ids is not None:
            processed_ids = confirmed_block_ids
            missing_ids = list(set(all_item_block_ids) - set(confirmed_block_ids))
        else:
            # ถ้าไม่มีการส่งรายการมา (เช่นกดปุ่ม Complete ทันที) ให้ถือว่าครบทั้งหมด
            processed_ids = all_item_block_ids
            missing_ids = []

        # 4. อัปเดตสถานะ SurgicalBlock
        if processed_ids:
            db.query(SurgicalBlock).filter(SurgicalBlock.id.in_(processed_ids)).update(
                {"status": "processed"}, synchronize_session=False
            )

        if missing_ids:
            db.query(SurgicalBlock).filter(SurgicalBlock.id.in_(missing_ids)).update(
                {"status": "grossed"},
                synchronize_session=False,  # ส่งกลับไปรอเข้าเครื่องใหม่หรือตรวจสอบ
            )

        # 5. อัปเดตสถานะใน TissueProcessingItem ให้ละเอียดขึ้น
        for item in items:
            if item.block_id in processed_ids:
                item.status = "completed"
                item.processed_out_at = local_now()
            else:
                item.status = "missing"  # บันทึกว่าหายในเครื่องรอบนี้

        # 6. เช็คสถานะ Specimen (Logic เดิมของคุณที่ถูกต้องแล้ว)
        specimen_ids = (
            db.query(SurgicalBlock.specimen_id)
            .filter(SurgicalBlock.id.in_(all_item_block_ids))
            .distinct()
            .all()
        )

        for (spec_id,) in specimen_ids:
            # 1. ดึง Specimen object มาเพื่อเอา case_id
            specimen = db.query(SurgicalSpecimen).get(spec_id)
            if not specimen:
                continue

            # 2. นับจำนวน Block ทั้งหมดใน Case นี้ (ไม่ใช่แค่ใน Specimen นี้)
            # หรือถ้าจะเช็คแค่ระดับ Specimen ให้ข้ามไปอัปเดต Case เมื่อทุก Specimen เสร็จ
            total_blocks = (
                db.query(SurgicalBlock)
                .join(SurgicalSpecimen)
                .filter(SurgicalSpecimen.case_id == specimen.case_id)
                .count()
            )

            done_blocks = (
                db.query(SurgicalBlock)
                .join(SurgicalSpecimen)
                .filter(
                    SurgicalSpecimen.case_id == specimen.case_id,
                    SurgicalBlock.status.in_(
                        ["processed", "embedded", "sectioned", "stained"]
                    ),
                )
                .count()
            )

            # 3. ถ้า Blocks ทุกอันใน Case นั้น Process เสร็จหมดแล้ว ให้แก้สถานะ Case
            if total_blocks > 0 and total_blocks == done_blocks:
                from app.models.surgical_case import SurgicalCase  # import มาถ้ายังไม่มี

                db.query(SurgicalCase).filter(
                    SurgicalCase.id == specimen.case_id
                ).update(
                    {
                        "is_processed": True,
                        "status": "processed",  # ปรับให้ตรงกับ Enum status ใน Case Model
                    }
                )

        db.commit()
        db.refresh(db_run)
        return db_run

    except Exception as e:
        db.rollback()
        raise e
