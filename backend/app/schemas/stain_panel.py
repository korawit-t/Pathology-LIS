from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class APTestBase(BaseModel):
    id: int
    name: str
    category: str
    is_external: bool = False
    price_tier_1: float = 0
    system_code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StainPanelItemResponse(BaseModel):
    id: int
    test_id: int
    sort_order: int
    test: Optional[APTestBase] = None

    model_config = ConfigDict(from_attributes=True)


class StainPanelCreate(BaseModel):
    name: str
    category: Optional[str] = "General"
    description: Optional[str] = None
    test_ids: List[int] = []


class StainPanelUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    test_ids: Optional[List[int]] = None


class StainPanelResponse(BaseModel):
    id: int
    name: str
    category: Optional[str]
    description: Optional[str]
    is_active: bool
    items: List[StainPanelItemResponse] = []
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
