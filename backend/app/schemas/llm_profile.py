from pydantic import ConfigDict, BaseModel
from typing import Optional
from datetime import datetime


class LlmProfileBase(BaseModel):
    display_name: str
    provider: str = "openai"
    model: str
    base_url: Optional[str] = None
    is_active: bool = True


class LlmProfileCreate(LlmProfileBase):
    pass


class LlmProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None
    is_active: Optional[bool] = None


class LlmProfileResponse(LlmProfileBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
