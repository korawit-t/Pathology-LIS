from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ReportType = Literal["surgical", "gyne", "nongyne"]


class FieldSource(BaseModel):
    """Where one target field takes its value from: a column of the file, or
    the same fixed value on every row."""

    column: Optional[str] = None
    value: Optional[str] = None

    @model_validator(mode="after")
    def _exactly_one(self):
        has_column = bool(self.column and self.column.strip())
        has_value = self.value is not None and self.value.strip() != ""
        if has_column == has_value:
            raise ValueError("each field takes either a column or a fixed value")
        return self


class ImportMapping(BaseModel):
    report_type: ReportType
    # The old system's name. With each report's own id in that system
    # (the source_ref field) it is what recognises a row already imported.
    source_system: str = Field(min_length=1, max_length=50)
    sheet: Optional[str] = None
    header_row: int = Field(default=1, ge=1, le=50)
    # target field key -> where its value comes from
    fields: Dict[str, FieldSource] = Field(default_factory=dict)
    # a value of the file's hospital column -> hospitals.id
    hospital_values: Dict[str, int] = Field(default_factory=dict)
    # used on rows whose hospital column is empty, or when it is not mapped
    default_hospital_id: Optional[int] = None
    # what to do with a row this source already imported
    on_duplicate: Literal["skip", "update"] = "skip"

    @field_validator("source_system")
    @classmethod
    def _strip_source_system(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("source_system is required")
        return v


# ── /fields ───────────────────────────────────────────────────────────────────

class TargetFieldOut(BaseModel):
    key: str
    label: str
    kind: str
    required: bool
    group: str
    help: Optional[str] = None


# ── /inspect ──────────────────────────────────────────────────────────────────

class InspectResponse(BaseModel):
    file_name: Optional[str] = None
    sheets: List[str]
    sheet: Optional[str] = None
    headers: List[str]
    sample_rows: List[List[Optional[str]]]
    total_rows: int
    suggested_fields: Dict[str, str]


# ── /preview ──────────────────────────────────────────────────────────────────

class ImportIssue(BaseModel):
    row: int
    level: Literal["error", "warning"]
    field: Optional[str] = None
    message: str


class HospitalValueMatch(BaseModel):
    value: str
    count: int
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None
    # how hospital_id was found: chosen on the page, or matched by code/name
    matched_by: Optional[Literal["mapping", "code", "name"]] = None


class PreviewRow(BaseModel):
    row: int
    existing: bool
    values: Dict[str, Any]


class PreviousBatch(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    inserted_count: int


class PreviewResponse(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    warning_rows: int
    new_rows: int
    existing_rows: int
    issues: List[ImportIssue]
    issues_truncated: bool
    sample: List[PreviewRow]
    hospital_values: List[HospitalValueMatch]
    same_file_batches: List[PreviousBatch]


# ── batches ───────────────────────────────────────────────────────────────────

class BatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    report_type: str
    source_system: str
    file_name: Optional[str] = None
    total_rows: int
    inserted_count: int
    updated_count: int
    skipped_count: int
    error_count: int
    status: str
    created_at: Optional[datetime] = None
    created_by_name: Optional[str] = None
    rolled_back_at: Optional[datetime] = None
    rolled_back_by_name: Optional[str] = None
    rolled_back_count: Optional[int] = None


class BatchList(BaseModel):
    total: int
    items: List[BatchOut]


# ── profiles ──────────────────────────────────────────────────────────────────

class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    mapping: ImportMapping

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name is required")
        return v


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    report_type: str
    mapping: Dict[str, Any]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
