from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


# ── IHC Marker Options (admin-configured) ────────────────────────────────────

class IHCMarkerOptionCreate(BaseModel):
    ap_test_id: int
    option_label: str
    option_value: str
    display_order: int = 0
    has_numeric: Optional[str] = None   # None | "%" | "score" | "custom"
    numeric_unit: Optional[str] = None  # e.g. "%", "CPS"

class IHCMarkerOptionUpdate(BaseModel):
    option_label: Optional[str] = None
    option_value: Optional[str] = None
    display_order: Optional[int] = None
    has_numeric: Optional[str] = None
    numeric_unit: Optional[str] = None

class IHCMarkerOptionResponse(BaseModel):
    id: int
    ap_test_id: int
    option_label: str
    option_value: str
    display_order: int
    has_numeric: Optional[str]
    numeric_unit: Optional[str]
    model_config = ConfigDict(from_attributes=True)


# ── IHC Results (pathologist-entered per specimen) ────────────────────────────

class IHCResultUpsert(BaseModel):
    surgical_specimen_id: int
    ap_test_id: int
    selected_option: Optional[str] = None
    numeric_value: Optional[float] = None
    note: Optional[str] = None

class IHCResultResponse(BaseModel):
    id: int
    surgical_specimen_id: int
    ap_test_id: int
    selected_option: Optional[str]
    numeric_value: Optional[float]
    note: Optional[str]
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Non-Gyne IHC Results (case-level) ────────────────────────────────────────

class NongyneIHCResultUpsert(BaseModel):
    case_id: int
    ap_test_id: int
    selected_option: Optional[str] = None
    numeric_value: Optional[float] = None
    note: Optional[str] = None

class NongyneIHCResultResponse(BaseModel):
    id: int
    case_id: int
    ap_test_id: int
    selected_option: Optional[str]
    numeric_value: Optional[float]
    note: Optional[str]
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ── Composite: marker + its options + saved result ────────────────────────────

class IHCMarkerWithResult(BaseModel):
    ap_test_id: int
    marker_name: str
    options: List[IHCMarkerOptionResponse]
    result: Optional[IHCResultResponse] = None
    model_config = ConfigDict(from_attributes=True)

class NongyneIHCMarkerWithResult(BaseModel):
    ap_test_id: int
    marker_name: str
    options: List[IHCMarkerOptionResponse]
    result: Optional[NongyneIHCResultResponse] = None
    model_config = ConfigDict(from_attributes=True)
