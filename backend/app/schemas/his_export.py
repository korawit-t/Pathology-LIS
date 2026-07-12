from pydantic import ConfigDict, BaseModel
from datetime import datetime
from typing import Optional, List


class HisExportLogResponse(BaseModel):
    id: int
    resource_type: str
    resource_id: int
    accession_no: Optional[str] = None
    status: str
    adapter_type: Optional[str] = None
    payload_snapshot: Optional[dict] = None
    response_snapshot: Optional[dict] = None
    error_message: Optional[str] = None
    his_reference_id: Optional[str] = None
    attempt_count: int
    max_attempts: int
    next_attempt_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    triggered_by: str
    created_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class HisExportLogList(BaseModel):
    total: int
    items: List[HisExportLogResponse]
