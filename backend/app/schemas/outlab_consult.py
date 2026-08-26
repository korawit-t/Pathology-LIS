from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from typing import List, Optional


class CaseSelection(BaseModel):
    case_type: str
    case_id: int
    accession_no: Optional[str] = None
    patient_name: Optional[str] = None
    block_code: Optional[str] = None


class OutlabConsultRunCreate(BaseModel):
    destination_lab: str
    cases: List[CaseSelection]


class OutlabConsultRunDetailResponse(BaseModel):
    id: int
    run_id: int
    case_type: str
    case_id: int
    accession_no: Optional[str] = None
    patient_name: Optional[str] = None
    block_code: Optional[str] = None
    report_out_at: Optional[datetime] = None
    remark: Optional[str] = None
    created_at: datetime
    block_returned: bool = False
    block_returned_at: Optional[datetime] = None
    block_returned_by_id: Optional[int] = None

    # Live status of the underlying case (not a stored column — attached at
    # query time in get_consult_runs) so the UI can show this specific case's
    # own progress instead of the shipment run's overall "sent"/"received" status.
    case_consult_status: Optional[str] = None
    # Whether the underlying case already has a consult_pdf_path uploaded
    # (also attached at query time) — lets the UI offer "View PDF" instead of
    # only "Upload PDF" once a report has come back for this case.
    consult_pdf_uploaded: bool = False

    model_config = ConfigDict(from_attributes=True)


class OutlabConsultRunResponse(BaseModel):
    id: int
    run_no: str
    destination_lab: Optional[str] = None
    operator_id: Optional[int] = None
    sent_at: datetime
    status: str
    received_at: Optional[datetime] = None
    received_by_id: Optional[int] = None
    tracking_number: Optional[str] = None
    details: List[OutlabConsultRunDetailResponse] = []

    model_config = ConfigDict(from_attributes=True)


class OutlabConsultRunUpdateTracking(BaseModel):
    tracking_number: Optional[str] = None


# ─── Registration info (data to key into the external lab's own system) ──────
# The staffer sending a case out has to re-register it by hand at the
# destination lab. This bundle is exactly the fields that form asks for,
# pulled from whichever of the three case types the case belongs to.


class OutlabRegistrationSlide(BaseModel):
    id: int
    slide_label: Optional[str] = None
    slide_no: int = 1
    test_name: Optional[str] = None
    test_category: Optional[str] = None
    status: Optional[str] = None
    is_recut: bool = False

    model_config = ConfigDict(from_attributes=True)


class OutlabRegistrationBlock(BaseModel):
    id: int
    block_code: str
    specimen_label: Optional[str] = None
    specimen_name: Optional[str] = None
    tissue_count: Optional[int] = None
    status: Optional[str] = None
    slides: List[OutlabRegistrationSlide] = []

    model_config = ConfigDict(from_attributes=True)


class OutlabRegistrationInfoResponse(BaseModel):
    case_type: str
    case_id: int
    accession_no: Optional[str] = None
    hn: Optional[str] = None

    # Patient — kept as separate parts (not just a joined display name)
    # because the destination lab's form has one field per part.
    patient_title: Optional[str] = None
    patient_first_name: Optional[str] = None
    patient_last_name: Optional[str] = None
    patient_full_name: Optional[str] = None
    cid: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[date] = None
    age_display: Optional[str] = None

    # Request
    clinician_name: Optional[str] = None
    collect_at: Optional[datetime] = None
    clinical_diagnosis: Optional[str] = None
    clinical_history: Optional[str] = None
    specimen_type: Optional[str] = None
    collection_site: Optional[str] = None
    hospital_name: Optional[str] = None
    department_name: Optional[str] = None
    consult_reason: Optional[str] = None

    # Material being sent. Surgical cases carry blocks (each with its own
    # slides); cytology cases have no blocks, so their slides sit at case
    # level in `slides`.
    blocks: List[OutlabRegistrationBlock] = []
    slides: List[OutlabRegistrationSlide] = []
    block_count: int = 0
    slide_count: int = 0
