from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime

class NotificationChannelBase(BaseModel):
    platform: str
    name: str
    credentials: Dict[str, Any]
    is_active: bool = True

class NotificationChannelCreate(NotificationChannelBase):
    pass

class NotificationChannelUpdate(BaseModel):
    platform: Optional[str] = None
    name: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class NotificationChannelResponse(NotificationChannelBase):
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
