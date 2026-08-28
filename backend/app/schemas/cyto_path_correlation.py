from typing import Literal, Optional

from pydantic import BaseModel, field_validator

VerdictResult = Literal[
    "concordant", "minor_discrepancy", "major_discrepancy", "not_applicable"
]

DiscrepancyCategory = Literal[
    "interpretive", "screening_miss", "sampling", "wording", "other"
]


class VerdictUpdate(BaseModel):
    """QC officer grades one case. `result=None` parks it back as pending."""

    result: Optional[VerdictResult] = None
    discrepancy_category: Optional[DiscrepancyCategory] = None
    comment: Optional[str] = None

    @field_validator("comment")
    @classmethod
    def _blank_to_none(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() or None if isinstance(v, str) else v


class SendToPathologistRequest(BaseModel):
    """Cytotech hands a non-gyne case to a pathologist."""

    pathologist_id: int
    status: Optional[str] = None
    signers: Optional[list] = None
