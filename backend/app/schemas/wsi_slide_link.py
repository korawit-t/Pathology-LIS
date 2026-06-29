from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_validator


class WsiSlideLinkCreate(BaseModel):
    wsi_file_id: int
    surgical_block_id: int
    stain_type: str = "HE"
    is_primary: bool = True
    notes: Optional[str] = None


class WsiSlideLinkUpdate(BaseModel):
    status: Optional[str] = None       # 'confirmed' | 'rejected'
    is_primary: Optional[bool] = None
    notes: Optional[str] = None


class WsiSlideLinkResponse(BaseModel):
    id: int
    wsi_file_id: int
    surgical_block_id: int
    stain_type: str
    is_primary: bool
    link_method: Optional[str] = None
    link_confidence: Optional[float] = None
    status: str
    linked_at: datetime
    confirmed_at: Optional[datetime] = None
    notes: Optional[str] = None
    block_code: Optional[str] = None
    accession_no: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def extract_block_info(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        blk = getattr(data, "surgical_block", None)
        spec = getattr(blk, "specimen", None) if blk else None
        case = getattr(spec, "case", None) if spec else None
        result = {
            col: getattr(data, col, None)
            for col in [
                "id", "wsi_file_id", "surgical_block_id", "stain_type",
                "is_primary", "link_method", "link_confidence", "status",
                "linked_at", "confirmed_at", "notes",
            ]
        }
        if blk and spec:
            result["block_code"] = f"{spec.specimen_label}{blk.block_no}"
        if case:
            result["accession_no"] = case.accession_no
        return result
