"""Response shapes for the IHC TAT dashboard (crud.ihc_tat)."""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel


class IhcTatRequest(BaseModel):
    """One IHC request: a case's IHC slides that went out at one sign-off."""
    case_id: int
    accession_no: Optional[str] = None
    patient_title: Optional[str] = None
    patient_name: Optional[str] = None
    patient_ln: Optional[str] = None
    markers: List[str]
    slides: int
    source: Literal["outlab", "in-house"]
    lab: Optional[str] = None
    ordered_at: datetime
    sent_at: Optional[datetime] = None
    ready_at: Optional[datetime] = None
    reported_at: datetime
    # Working days: order → out, at the outlab, slide ready → out
    total_days: float
    outlab_days: Optional[float] = None
    reading_days: Optional[float] = None
    bucket: Literal["lt3", "t3_5", "t5_10", "gt10"]
    # total_days within the IHC target (system_settings.ihc_tat_days)
    on_time: bool


class IhcTatSummary(BaseModel):
    requests: int
    slides: int
    outlab_requests: int
    inhouse_requests: int
    median_total_days: Optional[float] = None
    median_outlab_days: Optional[float] = None
    median_reading_days: Optional[float] = None
    target_days: int
    on_time_count: int
    on_time_pct: Optional[float] = None


class IhcTatDistribution(BaseModel):
    lt3: int
    t3_5: int
    t5_10: int
    gt10: int


class IhcTatMonth(BaseModel):
    month: str
    requests: int
    median_total_days: Optional[float] = None
    on_time_pct: Optional[float] = None


class IhcTatLab(BaseModel):
    lab: str
    requests: int
    median_outlab_days: Optional[float] = None
    max_outlab_days: float


class IhcTatResponse(BaseModel):
    summary: IhcTatSummary
    distribution: IhcTatDistribution
    monthly: List[IhcTatMonth]
    by_lab: List[IhcTatLab]
    requests: List[IhcTatRequest]


class IhcOutstandingMarker(BaseModel):
    name: Optional[str] = None
    status: str
    is_external: bool = False


class IhcOutstandingCase(BaseModel):
    """A case whose IHC hasn't gone out yet."""
    case_id: int
    accession_no: Optional[str] = None
    patient_title: Optional[str] = None
    patient_name: Optional[str] = None
    patient_ln: Optional[str] = None
    markers: List[IhcOutstandingMarker]
    # Least advanced slide: pending → sent (at outlab) → stained (ready to
    # read) → completed (result entered, not signed out)
    stage: Literal["pending", "sent", "stained", "completed"]
    ordered_at: datetime
    sent_at: Optional[datetime] = None
    lab: Optional[str] = None
    age_days: float
    # Waited longer than the IHC target already
    overdue: bool
