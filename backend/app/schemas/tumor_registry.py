from pydantic import ConfigDict, BaseModel
from typing import Optional
from datetime import datetime


class TumorRegistryBase(BaseModel):
    topography_code: Optional[str] = None
    topography_desc: Optional[str] = None
    morphology_code: Optional[str] = None
    morphology_desc: Optional[str] = None
    grade: Optional[str] = None
    pt: Optional[str] = None
    pn: Optional[str] = None
    pm: Optional[str] = None


class TumorRegistryUpsert(TumorRegistryBase):
    pass


class TumorRegistryResponse(TumorRegistryBase):
    id: int
    surgical_case_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
