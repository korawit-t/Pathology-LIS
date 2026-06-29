from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.dependencies.auth import get_current_user, check_password_status
from app.core.roles import CAN_ACCESS_SURGICAL_BLOCK
from app.schemas.surgical_block_event import (
    BlockEventCreate,
    BlockEventResponse,
    BlockTimelineEntry,
)
from app.crud.surgical_block_event import create_event, delete_event, get_timeline
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_event import SurgicalBlockEvent

router = APIRouter(
    prefix="/surgical-blocks",
    tags=["Surgical Block Events"],
    dependencies=[
        Depends(check_password_status),
        Depends(CAN_ACCESS_SURGICAL_BLOCK),
    ],
)


@router.get("/{block_id}/timeline", response_model=List[BlockTimelineEntry])
def get_block_timeline(block_id: int, db: Session = Depends(get_db)):
    block = db.query(SurgicalBlock).filter(SurgicalBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return get_timeline(db, block_id)


@router.post("/{block_id}/events", response_model=BlockEventResponse, status_code=status.HTTP_201_CREATED)
def add_block_event(
    block_id: int,
    payload: BlockEventCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    block = db.query(SurgicalBlock).filter(SurgicalBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return create_event(db, block_id, payload, current_user.id)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_block_event(event_id: int, db: Session = Depends(get_db)):
    ev = db.query(SurgicalBlockEvent).filter(SurgicalBlockEvent.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    delete_event(db, event_id)
    return None
