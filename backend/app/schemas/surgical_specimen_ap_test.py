from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import Optional
from app.schemas.anatomical_pathology_test import AnatomicalPathologyTestResponse


class SpecimenAPTestBase(BaseModel):
    surgical_specimen_id: int
    ap_test_id: int


class SpecimenAPTestCreate(SpecimenAPTestBase):
    pass


class SpecimenAPTestResponse(SpecimenAPTestBase):
    id: int
    created_at: datetime

    # 👇 ให้ใช้ schema ที่ถูกต้อง
    ap_test: Optional[AnatomicalPathologyTestResponse] = None

    model_config = ConfigDict(from_attributes=True)
