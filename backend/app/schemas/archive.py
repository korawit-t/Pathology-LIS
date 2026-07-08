from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import Optional, List


class ArchiveItem(BaseModel):
    source: str
    id: int
    accession_no: Optional[str] = None
    patient_title: Optional[str] = None
    patient_name: Optional[str] = None
    patient_ln: Optional[str] = None
    patient_hn: Optional[str] = None
    patient_gender: Optional[str] = None
    patient_age: Optional[int] = None
    hospital_name: Optional[str] = None
    department_name: Optional[str] = None
    clinician_name: Optional[str] = None
    pathologist_name: Optional[str] = None
    date: Optional[datetime] = None
    status: Optional[str] = None
    has_malignancy: Optional[bool] = None
    adequacy_text: Optional[str] = None
    category_1_text: Optional[str] = None
    interpretation: Optional[str] = None
    specimen: Optional[str] = None
    collection_site: Optional[str] = None
    case_id: Optional[int] = None
    has_outlab_result: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class ArchivePage(BaseModel):
    items: List[ArchiveItem]
    total: int
