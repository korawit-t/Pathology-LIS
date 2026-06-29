from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.database import get_db
from app.crud import slide_storage as crud
from app.schemas import slide_storage as schemas
from app.dependencies.auth import get_current_user
from app.models.user import User

router = APIRouter(
    prefix="/slide-storage",
    tags=["Slide Storage"],
    dependencies=[Depends(get_current_user)],
)

@router.get("/pending-tree")
def read_pending_slides_tree(
    stain_category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    ดึงรายการสไลด์ที่รอจัดเก็บ (จัดกลุ่มตาม Case)
    stain_category: HE | Special | IHC
    """
    return crud.get_pending_storage_slides_tree(db, stain_category=stain_category)

@router.post("/batch", response_model=schemas.SlideStorageRun)
def create_slide_storage_batch(
    payload: schemas.SlideStorageRunCreateBatch,
    db: Session = Depends(get_db)
):
    """
    บันทึกการจัดเก็บแบบทีละหลายแผ่น (Batch Storage)
    """
    try:
        run = crud.create_slide_storage_run_batch(db, obj_in=payload)
        return run
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ไม่สามารถบันทึกรอบการจัดเก็บสไลด์ได้: {str(e)}"
        )

@router.get("/search", response_model=List[schemas.SlideStorageRun])
def search_slide_storage_by_accession(
    accession_no: str = Query(..., min_length=1),
    stain_category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Find slide storage runs that contain slides for the given accession number."""
    return crud.search_runs_by_accession(db, accession_no, stain_category)


@router.get("/runs", response_model=List[schemas.SlideStorageRun])
def read_slide_storage_runs(
    skip: int = 0,
    limit: int = 100,
    stain_category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    ดึงรายการประวัติการจัดเก็บสไลด์
    """
    return crud.get_slide_storage_runs(db, skip=skip, limit=limit, stain_category=stain_category)

@router.get("/runs/{run_id}", response_model=schemas.SlideStorageRun)
def read_slide_storage_run(
    run_id: int, db: Session = Depends(get_db)
):
    """
    ดึงรายละเอียดของรอบการจัดเก็บสไลด์
    """
    run = crud.get_slide_storage_run_detail(db, run_id=run_id)
    if not run:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลรอบการจัดเก็บ")
    return run

@router.get("/stored-runs", response_model=dict)
def read_stored_slide_runs(
    skip: int = 0,
    limit: int = 50,
    stain_category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    items, total = crud.get_stored_slide_runs(db, skip=skip, limit=limit, stain_category=stain_category)
    return {"items": [schemas.SlideStorageRun.model_validate(r) for r in items], "total": total}

@router.get("/disposed-runs", response_model=dict)
def read_disposed_slide_runs(
    skip: int = 0,
    limit: int = 50,
    stain_category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    items, total = crud.get_disposed_slide_runs(db, skip=skip, limit=limit, stain_category=stain_category)
    return {"items": [schemas.SlideStorageRun.model_validate(r) for r in items], "total": total}

@router.post("/dispose-runs", response_model=List[schemas.SlideStorageRun])
def dispose_slide_runs(
    payload: schemas.SlideStorageDisposeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.dispose_slide_runs(db, run_ids=payload.run_ids, user_id=current_user.id)

@router.get("/stored-slides", response_model=dict)
def read_stored_slide_details(
    skip: int = 0,
    limit: int = 50,
    search: str = Query(""),
    stain_category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    items, total = crud.get_stored_slide_details(db, skip=skip, limit=limit, search=search, stain_category=stain_category)
    return {"items": [schemas.SlideStorageDetail.model_validate(r) for r in items], "total": total}

@router.get("/disposed-slides", response_model=dict)
def read_disposed_slide_details(
    skip: int = 0,
    limit: int = 50,
    search: str = Query(""),
    stain_category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    items, total = crud.get_disposed_slide_details(db, skip=skip, limit=limit, search=search, stain_category=stain_category)
    return {"items": [schemas.SlideStorageDetail.model_validate(r) for r in items], "total": total}

@router.post("/dispose-slides", response_model=List[schemas.SlideStorageDetail])
def dispose_slides(
    payload: schemas.SlideDisposeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.dispose_slide_details(db, detail_ids=payload.detail_ids, user_id=current_user.id)

@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_slide_storage_run(
    run_id: int, db: Session = Depends(get_db)
):
    """
    ลบรอบการจัดเก็บสไลด์
    """
    success = crud.delete_slide_storage_run(db, run_id=run_id)
    if not success:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลรอบการจัดเก็บ")
    return None
