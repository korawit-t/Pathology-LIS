import enum


# --- 1. Enums ---
class DiagnosisLevel(str, enum.Enum):
    SPECIMEN = "SPECIMEN"
    CASE = "CASE"


class DiagnosisEntryType(str, enum.Enum):
    ORIGINAL = "Original"
    ADDENDUM = "Addendum"
    REVISED = "Revised"
    CORRECTED = "Corrected"


class DiagnosisStatus(str, enum.Enum):
    DRAFT = "draft"
    SIGNED = "signed"
    CANCELLED = "cancelled"
