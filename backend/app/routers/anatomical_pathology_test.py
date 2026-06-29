from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List  # 🚩 ต้องมีตัวนี้
from app.db.database import get_db
from app.schemas.anatomical_pathology_test import (
    AnatomicalPathologyTestCreate,
    AnatomicalPathologyTestUpdate,
    AnatomicalPathologyTestResponse,
)
from app.crud.anatomical_pathology_test import (
    create_test,
    get_test_by_id,
    list_tests,
    update_test,
    delete_test,
)
from app.dependencies.auth import get_current_user, RoleChecker
from app.models.user import User

router = APIRouter(
    prefix="/anatomical-pathology-tests", tags=["Anatomical Pathology Tests"]
)


# --- Create (Admin only) ---
@router.post(
    "",
    response_model=AnatomicalPathologyTestResponse,
    dependencies=[Depends(RoleChecker(["admin"]))],
)
def create(
    data: AnatomicalPathologyTestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_test(db, data)


# --- Read All (Global Filter) ---
@router.get(
    "",
    response_model=List[AnatomicalPathologyTestResponse],
    dependencies=[Depends(RoleChecker(["admin", "histo", "gross", "pathologist"]))],
)
def read_all(
    category: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_tests(db, category=category)


# --- Read by ID ---
@router.get(
    "/{item_id}",
    response_model=AnatomicalPathologyTestResponse,
    dependencies=[Depends(RoleChecker(["admin", "histo", "gross", "pathologist"]))],
)
def read(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = get_test_by_id(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Test entry not found")
    return item


# --- Update (Admin only) ---
@router.put(
    "/{item_id}",
    response_model=AnatomicalPathologyTestResponse,
    dependencies=[Depends(RoleChecker(["admin"]))],
)
def update(
    item_id: int,
    data: AnatomicalPathologyTestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = update_test(db, item_id, data)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


# --- Delete (Admin only) ---
@router.delete("/{item_id}", dependencies=[Depends(RoleChecker(["admin"]))])
def delete(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    delete_test(db, item_id)
    return {"deleted": True}
