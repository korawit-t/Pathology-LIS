from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.wsi_slide_link import WsiSlideLinkResponse


class WsiFileResponse(BaseModel):
    id: int
    file_path: str
    filename: str
    file_size_bytes: Optional[int] = None
    format: Optional[str] = None
    width_px: Optional[int] = None
    height_px: Optional[int] = None
    mpp_x: Optional[float] = None
    mpp_y: Optional[float] = None
    level_count: Optional[int] = None
    parsed_accession: Optional[str] = None
    parsed_block: Optional[str] = None
    parse_confidence: Optional[str] = None
    discovered_at: datetime
    last_seen_at: Optional[datetime] = None
    slide_links: List[WsiSlideLinkResponse] = []

    model_config = ConfigDict(from_attributes=True)


class WsiScanResult(BaseModel):
    discovered: int
    updated: int
    auto_linked: int
    pending_review: int
