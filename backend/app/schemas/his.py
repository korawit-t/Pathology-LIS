"""
Pydantic schemas for HIS (HOSxP) patient query results.
"""
from pydantic import ConfigDict, BaseModel
from typing import Optional
from datetime import date, datetime


class HisPatientResult(BaseModel):
    """Single patient/lab-order result from the HOSxP database."""
    an: Optional[str] = None          # AN (admission number, 12 digits)
    vn: Optional[str] = None          # VN (visit number, 9 digits)
    hn: Optional[str] = None          # Hospital Number
    gender: Optional[str] = None      # Gender name (ชาย/หญิง)
    gender_code: Optional[int] = None # Gender code (1=male, 2=female in HOSxP)
    nationality: Optional[str] = None
    pname: Optional[str] = None       # Title/prefix (นาย/นาง/น.ส.)
    fname: Optional[str] = None       # First name
    lname: Optional[str] = None       # Last name
    birthday: Optional[str] = None    # Birthday as string
    cid: Optional[str] = None         # Citizen ID
    lab_order_number: Optional[str] = None
    doctor: Optional[str] = None      # Requesting doctor
    order_date: Optional[str] = None  # Order date as string
    department: Optional[str] = None  # Ordering department
    form_name: Optional[str] = None   # Lab form name
    ward: Optional[str] = None
    pttype: Optional[str] = None      # Patient type / medical scheme
    age: Optional[int] = None         # Calculated age in years

    model_config = ConfigDict(from_attributes=True)


class HisSearchParams(BaseModel):
    """Query parameters for HIS patient search."""
    hn: Optional[str] = None
    date_start: str  # yyyy-mm-dd
    date_end: str    # yyyy-mm-dd
