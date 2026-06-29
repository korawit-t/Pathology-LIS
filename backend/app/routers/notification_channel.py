from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.db.database import get_db
from app.schemas.notification_channel import NotificationChannelCreate, NotificationChannelUpdate, NotificationChannelResponse
from app.crud import notification_channel as crud_channel
from app.dependencies.auth import get_current_active_user
from app.services.notification_service import send_test_notification, send_real_notification
from pydantic import BaseModel


class NotificationSendBody(BaseModel):
    data: Dict[str, Any]  # { hn, name, clinician, id_case, ... }


router = APIRouter(
    prefix="/notification-channels",
    tags=["Notification Channels"],
    dependencies=[Depends(get_current_active_user)]
)

@router.get("", response_model=List[NotificationChannelResponse])
def read_channels(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    channels = crud_channel.get_channels(db, skip=skip, limit=limit)
    return channels

@router.get("/{channel_id}", response_model=NotificationChannelResponse)
def read_channel(channel_id: int, db: Session = Depends(get_db)):
    db_channel = crud_channel.get_channel(db, channel_id=channel_id)
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return db_channel

@router.post("", response_model=NotificationChannelResponse, status_code=status.HTTP_201_CREATED)
def create_channel(channel: NotificationChannelCreate, db: Session = Depends(get_db)):
    return crud_channel.create_channel(db=db, channel=channel)

@router.put("/{channel_id}", response_model=NotificationChannelResponse)
def update_channel(channel_id: int, channel: NotificationChannelUpdate, db: Session = Depends(get_db)):
    db_channel = crud_channel.update_channel(db, channel_id=channel_id, channel=channel)
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return db_channel

@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(channel_id: int, db: Session = Depends(get_db)):
    success = crud_channel.delete_channel(db, channel_id=channel_id)
    if not success:
        raise HTTPException(status_code=404, detail="Channel not found")
    return


@router.post("/{channel_id}/test")
async def test_channel(channel_id: int, db: Session = Depends(get_db)):
    """Send a test notification with dummy data to verify channel credentials."""
    db_channel = crud_channel.get_channel(db, channel_id=channel_id)
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")

    try:
        result = await send_test_notification(
            platform=db_channel.platform,
            credentials=db_channel.credentials,
        )
        return {"success": True, "detail": f"Test message sent via {db_channel.platform}", "result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to send test notification: {str(e)}")


@router.post("/{channel_id}/send")
async def send_channel_notification(channel_id: int, body: NotificationSendBody, db: Session = Depends(get_db)):
    """Send a notification with real case data to a specific channel."""
    db_channel = crud_channel.get_channel(db, channel_id=channel_id)
    if db_channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not db_channel.is_active:
        raise HTTPException(status_code=400, detail="Channel is not active")

    try:
        result = await send_real_notification(
            platform=db_channel.platform,
            credentials=db_channel.credentials,
            data=body.data,
        )
        return {"success": True, "detail": f"Notification sent via {db_channel.platform}", "result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to send notification: {str(e)}")
