from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class ExternalLabBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True

class ExternalLabCreate(ExternalLabBase):
    pass

class ExternalLabUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class ExternalLabResponse(ExternalLabBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
