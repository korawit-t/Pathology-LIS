from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.surgical_specimen_ap_test import (
    SpecimenAPTestCreate,
    SpecimenAPTestResponse
)
from app.crud.surgical_specimen_ap_test_service import (
    create_specimen_test,
    get_specimen_tests,
    delete_specimen_test
)
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/specimen-ap-tests",
    tags=["Specimen AP Tests"],
    dependencies=[Depends(get_current_user)],
)


@router.post("", response_model=SpecimenAPTestResponse)
def add_test_to_specimen(data: SpecimenAPTestCreate, db: Session = Depends(get_db)):
    return create_specimen_test(db, data)


@router.get("/{specimen_id}", response_model=list[SpecimenAPTestResponse])
def list_tests(specimen_id: int, db: Session = Depends(get_db)):
    return get_specimen_tests(db, specimen_id)


@router.delete("/{item_id}")
def remove_test(item_id: int, db: Session = Depends(get_db)):
    result = delete_specimen_test(db, item_id)
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Deleted"}
