from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.database import get_db
from app.schemas.stain_panel import StainPanelCreate, StainPanelUpdate, StainPanelResponse
from app.crud import stain_panel as crud
from app.dependencies.auth import get_current_user

router = APIRouter(
    prefix="/stain-panels",
    tags=["Stain Panels"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=List[StainPanelResponse])
def list_panels(
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    return crud.get_stain_panels(db, skip=skip, limit=limit, category=category, is_active=True)


@router.post("", response_model=StainPanelResponse, status_code=status.HTTP_201_CREATED)
def create_panel(
    panel: StainPanelCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return crud.create_stain_panel(db, panel, user_id=current_user.id)


@router.patch("/{panel_id}", response_model=StainPanelResponse)
def update_panel(
    panel_id: int,
    panel: StainPanelUpdate,
    db: Session = Depends(get_db),
):
    db_panel = crud.update_stain_panel(db, panel_id, panel)
    if db_panel is None:
        raise HTTPException(status_code=404, detail="Panel not found")
    return db_panel


@router.delete("/{panel_id}")
def delete_panel(panel_id: int, db: Session = Depends(get_db)):
    db_panel = crud.delete_stain_panel(db, panel_id)
    if db_panel is None:
        raise HTTPException(status_code=404, detail="Panel not found")
    return {"message": "Successfully deleted"}
