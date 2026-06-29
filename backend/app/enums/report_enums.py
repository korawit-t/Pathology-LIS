# app/enums.py
import enum


class ReportStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending"
    PUBLISHED = "published"
    CANCELLED = "cancelled"


class ReportType(str, enum.Enum):  # แนะนำให้ใช้ (str, enum.Enum) ทั้งคู่ครับ
    FINAL = "Final"
    ADDENDUM = "Addendum"
    CORRECTED = "Corrected"
    REVISED = "Revised"
