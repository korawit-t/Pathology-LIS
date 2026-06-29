from pydantic import BaseModel, ConfigDict
from typing import Optional


class OutlabShortInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class AnatomicalPathologyTestBase(BaseModel):
    code: Optional[str] = None
    system_code: Optional[str] = None

    name: str
    description: Optional[str] = None
    category: str
    specimen_complexity: Optional[str] = None  # small | medium | large
    is_external: bool = False
    is_system_default: bool = False
    outlab_id: Optional[int] = None

    price_tier_1: float = 0.0
    price_tier_2: float = 0.0
    price_tier_3: float = 0.0


class AnatomicalPathologyTestCreate(AnatomicalPathologyTestBase):
    pass


class AnatomicalPathologyTestUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    specimen_complexity: Optional[str] = None
    is_external: Optional[bool] = None
    outlab_id: Optional[int] = None
    price_tier_1: Optional[float] = None
    price_tier_2: Optional[float] = None
    price_tier_3: Optional[float] = None


class AnatomicalPathologyTestResponse(AnatomicalPathologyTestBase):
    id: int
    outlab: Optional[OutlabShortInfo] = None

    model_config = ConfigDict(from_attributes=True)
