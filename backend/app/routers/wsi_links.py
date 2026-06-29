from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.roles import CAN_VIEW_WSI, CAN_MANAGE_SYSTEM_SETTINGS
from app.dependencies.auth import get_current_active_user
from app.models.user import User
from app.schemas.wsi_slide_link import WsiSlideLinkCreate, WsiSlideLinkResponse, WsiSlideLinkUpdate
from app.crud import wsi_slide_link as crud

router = APIRouter(prefix="/wsi-links", tags=["WSI Slide Links"])


@router.get("", response_model=List[WsiSlideLinkResponse], dependencies=[Depends(CAN_VIEW_WSI)])
def list_links(
    link_status: Optional[str] = Query(None, alias="status"),
    wsi_file_id: Optional[int] = None,
    surgical_block_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    return crud.get_links(
        db,
        status=link_status,
        wsi_file_id=wsi_file_id,
        surgical_block_id=surgical_block_id,
        skip=skip,
        limit=limit,
    )


@router.post("", response_model=WsiSlideLinkResponse, status_code=status.HTTP_201_CREATED)
def create_link(
    data: WsiSlideLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return crud.create_link(db, data, linked_by_id=current_user.id)


@router.patch("/{link_id}", response_model=WsiSlideLinkResponse)
def update_link(
    link_id: int,
    data: WsiSlideLinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    link = crud.get_link_by_id(db, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    return crud.update_link(db, link, data, confirmed_by_id=current_user.id)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(CAN_MANAGE_SYSTEM_SETTINGS)])
def delete_link(link_id: int, db: Session = Depends(get_db)):
    link = crud.get_link_by_id(db, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    crud.delete_link(db, link)
