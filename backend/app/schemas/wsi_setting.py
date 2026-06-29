from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class WsiScannerProfileBase(BaseModel):
    name: str
    filename_pattern: str
    file_extensions: List[str] = []
    separator: Optional[str] = None
    is_active: bool = True


class WsiScannerProfileCreate(WsiScannerProfileBase):
    pass


class WsiScannerProfileUpdate(BaseModel):
    name: Optional[str] = None
    filename_pattern: Optional[str] = None
    file_extensions: Optional[List[str]] = None
    separator: Optional[str] = None
    is_active: Optional[bool] = None


class WsiScannerProfileResponse(WsiScannerProfileBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class WsiSettingUpdate(BaseModel):
    wsi_root_path: Optional[str] = None
    default_scanner_profile_id: Optional[int] = None


class WsiSettingResponse(BaseModel):
    id: int
    hospital_slug: Optional[str] = "master"
    wsi_root_path: Optional[str] = None
    default_scanner_profile_id: Optional[int] = None
    default_scanner_profile: Optional[WsiScannerProfileResponse] = None
    model_config = ConfigDict(from_attributes=True)


class WsiFileInfo(BaseModel):
    filename: str
    path: str
    size_mb: float
    modified_at: datetime
    extension: str
