"""Schemas for the diagnosis-search report (free-text case finder).

Answers questions of the shape "how many cases had a <colon, biopsy> specimen
that came back <adenocarcinoma>?" — a specimen-text condition AND a
diagnosis-text condition, over a date range, listed case by case so the result
can be checked by eye and exported.
"""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict

MatchMode = Literal["all", "any"]
DateField = Literal["registered", "reported"]


class DiagnosisSearchCriteria(BaseModel):
    """Echo of what was searched — rendered into the PDF header so a printed
    report always carries the query that produced it."""

    specimen_terms: List[str] = []
    diagnosis_terms: List[str] = []
    match_mode: MatchMode = "all"
    include_gross: bool = False
    include_microscopic: bool = False
    date_field: DateField = "registered"
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    hospital_name: Optional[str] = None
    only_reported: bool = True


class DiagnosisSearchRow(BaseModel):
    case_id: int
    accession_no: str
    hn: Optional[str] = None
    patient_name: str
    gender: Optional[str] = None
    hospital_name: Optional[str] = None
    registered_at: Optional[datetime] = None
    report_at: Optional[datetime] = None
    status: Optional[str] = None
    is_reported: bool = False
    has_malignancy: Optional[bool] = None
    pathologist_name: Optional[str] = None
    # The rows that actually satisfied the query, so the reader can audit a
    # hit instead of trusting the filter.
    matched_specimens: List[str] = []
    matched_diagnoses: List[str] = []

    model_config = ConfigDict(from_attributes=True)


class DiagnosisSearchResponse(BaseModel):
    total: int
    malignant_count: int
    items: List[DiagnosisSearchRow]
    criteria: DiagnosisSearchCriteria
