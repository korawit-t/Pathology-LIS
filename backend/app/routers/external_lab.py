from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.schemas.external_lab import ExternalLabResponse, ExternalLabCreate, ExternalLabUpdate
from app.crud import external_lab as crud
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/external-labs",
    tags=["External Labs"],
    dependencies=[Depends(get_current_user)],
)

@router.get("", response_model=List[ExternalLabResponse])
def read_external_labs(skip: int = 0, limit: int = 100, active_only: bool = False, db: Session = Depends(get_db)):
    return crud.get_external_labs(db, skip=skip, limit=limit, active_only=active_only)

@router.get("/{lab_id}", response_model=ExternalLabResponse)
def read_external_lab(lab_id: int, db: Session = Depends(get_db)):
    db_obj = crud.get_external_lab(db, lab_id=lab_id)
    if not db_obj:
        raise HTTPException(status_code=404, detail="External lab not found")
    return db_obj

@router.post("", response_model=ExternalLabResponse)
def create_external_lab(obj_in: ExternalLabCreate, db: Session = Depends(get_db)):
    return crud.create_external_lab(db, obj_in=obj_in)

@router.put("/{lab_id}", response_model=ExternalLabResponse)
def update_external_lab(lab_id: int, obj_in: ExternalLabUpdate, db: Session = Depends(get_db)):
    db_obj = crud.update_external_lab(db, lab_id=lab_id, obj_in=obj_in)
    if not db_obj:
        raise HTTPException(status_code=404, detail="External lab not found")
    return db_obj

@router.delete("/{lab_id}")
def delete_external_lab(lab_id: int, db: Session = Depends(get_db)):
    success = crud.delete_external_lab(db, lab_id=lab_id)
    if not success:
        raise HTTPException(status_code=404, detail="External lab not found")
    return {"message": "Deleted successfully"}
