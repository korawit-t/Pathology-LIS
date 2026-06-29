from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.schemas import tissue_processing as schemas
from app.crud import tissue_processing as crud
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/tissue-processing",
    tags=["Tissue Processing"],
    dependencies=[Depends(get_current_user)],
)


@router.post(
    "", response_model=schemas.TissueProcessingRun, status_code=status.HTTP_201_CREATED
)
def create_run(
    *, db: Session = Depends(get_db), obj_in: schemas.TissueProcessingRunCreate
):
    """
    บันทึกการนำเนื้อเข้าเครื่อง (Processing In)
    บังคับว่าต้องมี block_ids อย่างน้อย 1 รายการ
    """
    # ตรวจสอบความปลอดภัยอีกชั้น (แม้ Schema จะเช็ค min_length แล้วก็ตาม)
    if not obj_in.block_ids or len(obj_in.block_ids) == 0:
        raise HTTPException(
            status_code=400, detail="ต้องมีตลับเนื้ออย่างน้อย 1 ตลับเพื่อเริ่มการ Process"
        )

    return crud.create_processing_run(db=db, obj_in=obj_in)

@router.get("/machines", response_model=List[schemas.ProcessorMachineResponse])
def read_processor_machines(db: Session = Depends(get_db)):
    return crud.get_processor_machines(db, limit=100)

@router.post("/machines", response_model=schemas.ProcessorMachineResponse)
def create_processor_machine(obj_in: schemas.ProcessorMachineCreate, db: Session = Depends(get_db)):
    return crud.create_processor_machine(db, obj_in=obj_in)

@router.patch("/machines/{machine_id}", response_model=schemas.ProcessorMachineResponse)
def update_processor_machine(machine_id: int, obj_in: schemas.ProcessorMachineUpdate, db: Session = Depends(get_db)):
    updated = crud.update_processor_machine(db, machine_id, obj_in)
    if not updated: raise HTTPException(status_code=404, detail="Machine not found")
    return updated

@router.delete("/machines/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_processor_machine(machine_id: int, db: Session = Depends(get_db)):
    if not crud.delete_processor_machine(db, machine_id):
        raise HTTPException(status_code=404, detail="Machine not found")
    return None

@router.get("/programs", response_model=List[schemas.ProcessingProgramResponse])
def read_processing_programs(db: Session = Depends(get_db)):
    return crud.get_processing_programs(db, limit=100)

@router.post("/programs", response_model=schemas.ProcessingProgramResponse)
def create_processing_program(obj_in: schemas.ProcessingProgramCreate, db: Session = Depends(get_db)):
    return crud.create_processing_program(db, obj_in=obj_in)

@router.patch("/programs/{program_id}", response_model=schemas.ProcessingProgramResponse)
def update_processing_program(program_id: int, obj_in: schemas.ProcessingProgramUpdate, db: Session = Depends(get_db)):
    updated = crud.update_processing_program(db, program_id, obj_in)
    if not updated: raise HTTPException(status_code=404, detail="Program not found")
    return updated

@router.delete("/programs/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_processing_program(program_id: int, db: Session = Depends(get_db)):
    if not crud.delete_processing_program(db, program_id):
        raise HTTPException(status_code=404, detail="Program not found")
    return None


@router.get("/pending-blocks", response_model=List[dict])
def read_pending_blocks(db: Session = Depends(get_db)):
    """
    ดึงรายการตลับเนื้อที่ตัดเสร็จแล้ว (grossed) เพื่อนำไปแสดงใน Modal (Tree View)
    """
    return crud.get_pending_blocks_tree(db)


@router.get("", response_model=List[schemas.TissueProcessingRun])
def read_runs(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    status: str = None,  # เช่น ?status=processing
):
    # ส่ง status เข้าไปใน crud.get_processing_runs เลย
    return crud.get_processing_runs(db, skip=skip, limit=limit, status=status)


@router.get("/{run_id}", response_model=schemas.TissueProcessingRun)
def read_run(run_id: int, db: Session = Depends(get_db)):
    """
    ดูรายละเอียดรอบการรัน
    """
    db_run = crud.get_processing_run_by_id(db, run_id=run_id)
    if db_run is None:
        raise HTTPException(status_code=404, detail="Processing Run not found")
    return db_run


@router.patch("/{run_id}", response_model=schemas.TissueProcessingRun)
def edit_run(run_id: int, obj_in: schemas.TissueProcessingRunEdit, db: Session = Depends(get_db)):
    updated = crud.update_run(db, run_id, obj_in)
    if not updated:
        raise HTTPException(status_code=404, detail="Processing Run not found")
    return updated


@router.patch("/{run_id}/status", response_model=schemas.TissueProcessingRun)
def update_run_status(
    run_id: int,
    status_update: schemas.TissueProcessingRunUpdate,
    db: Session = Depends(get_db),
):
    """
    อัปเดตสถานะ (Processing Out) และอัปเดตสถานะ Blocks อัตโนมัติ
    รองรับการระบุจำนวนที่นับได้จริง และรายชื่อตลับที่ตรวจพบ
    """
    db_run_check = crud.get_processing_run_by_id(db, run_id=run_id)
    if not db_run_check:
        raise HTTPException(status_code=404, detail="ไม่พบรายการที่ต้องการอัปเดต")

    # ปรับปรุงการส่ง Parameter ให้ครบตาม Schema ใหม่
    updated_run = crud.update_run_status(
        db=db,
        run_id=run_id,
        status=status_update.status,
        user_id=status_update.completed_by_id,
        block_out_total=status_update.block_out_total,
        # ✅ อย่าลืมส่งตัวนี้ (ถ้าคุณปรับ CRUD ให้รับ confirmed_block_ids แล้ว)
        confirmed_block_ids=status_update.confirmed_block_ids,
    )

    if updated_run is None:
        raise HTTPException(status_code=400, detail="ไม่สามารถอัปเดตสถานะได้")

    return updated_run
