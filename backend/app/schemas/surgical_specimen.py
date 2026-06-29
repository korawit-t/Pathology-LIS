from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from app.schemas.gross_image import GrossImageResponse


class CaseInSpecimen(BaseModel):
    id: int
    accession_no: str
    model_config = ConfigDict(from_attributes=True)


class SurgicalSpecimenBase(BaseModel):
    specimen_label: str
    specimen_name: str
    gross_description: Optional[str] = None


class SurgicalSpecimenCreate(BaseModel):
    surgical_case_id: int
    specimen_name: str
    specimen_label: Optional[str] = None
    gross_description: Optional[str] = None


class SurgicalSpecimenUpdate(BaseModel):
    specimen_name: Optional[str] = None
    gross_description: Optional[str] = None
    is_entirely_submitted: Optional[bool] = None
    needs_additional_sections: Optional[bool] = None
    additional_sections_note: Optional[str] = None
    additional_sections_ordered_by_id: Optional[int] = None
    additional_sections_ordered_at: Optional[datetime] = None


# 🚩 สร้าง Schema เล็กๆ ไว้ที่นี่เลย เพื่อตัดวงจร Circular Import
class BlockInSpecimen(BaseModel):
    id: int
    block_no: int
    block_code: str
    status: Optional[str] = None
    tissue_count: Optional[int] = None
    is_tissue_uncountable: Optional[bool] = False
    model_config = ConfigDict(from_attributes=True)


class UserInSpecimen(BaseModel):
    id: int
    full_name: Optional[str] = None
    report_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class SurgicalSpecimenResponse(SurgicalSpecimenBase):
    id: int
    case_id: int
    case: Optional[CaseInSpecimen] = None
    is_entirely_submitted: bool = False

    # --- Audit Fields ---
    updated_at: datetime
    updated_by_id: Optional[int] = None
    updated_by_user: Optional[UserInSpecimen] = None

    # --- Additional Sections ---
    needs_additional_sections: bool = False
    additional_sections_note: Optional[str] = None
    additional_sections_ordered_by: Optional[UserInSpecimen] = None
    additional_sections_ordered_at: Optional[datetime] = None

    gross_images: List[GrossImageResponse] = []
    blocks: List[BlockInSpecimen] = []

    model_config = ConfigDict(from_attributes=True)


class AdditionalSectionsRequest(BaseModel):
    needs: bool
    note: Optional[str] = None
