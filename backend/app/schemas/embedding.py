# app/schemas/embedding.py
from pydantic import ConfigDict, BaseModel, model_validator
from datetime import datetime
from typing import Any, List, Optional

class EmbeddingBlockLite(BaseModel):
    accession_no: Optional[str] = None
    specimen_label: Optional[str] = None
    block_no: Optional[int] = None
    block_code: Optional[str] = None
    is_decal: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)

class EmbeddingDetailResponse(BaseModel):
    id: int
    run_id: int
    block_id: int
    embedded_at: datetime
    block: Optional[EmbeddingBlockLite] = None

    model_config = ConfigDict(from_attributes=True)

class EmbeddingRunResponse(BaseModel):
    id: int
    run_no: str
    started_at: datetime
    user_id: int
    user_full_name: Optional[str] = None
    details: List[EmbeddingDetailResponse] = []

    @model_validator(mode="before")
    @classmethod
    def populate_user_full_name(cls, data: Any) -> Any:
        if hasattr(data, "user") and data.user:
            data.__dict__["user_full_name"] = data.user.full_name or data.user.username
        return data

    model_config = ConfigDict(from_attributes=True)
        
class EmbeddingRunCreate(BaseModel):
    user_id: int
    station_id: Optional[str] = None

class ScanBlockRequest(BaseModel):
    run_id: int
    block_no: str # รับเป็นชื่อบาร์โค้ดที่สแกนมา