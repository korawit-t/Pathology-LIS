import enum


class CaseStatus(str, enum.Enum):
    """
    สถานะภาพรวมของเคส (Overall Case Workflow)
    มักจะสอดคล้องกับความคืบหน้าของรายงานและการวินิจฉัย
    """

    REGISTERED = "registered"
    FORMALIN_FIXING = "formalin_fixing"
    GROSSED = "grossed"
    PROCESSED = "processed"
    EMBEDDED = "embedded"
    STAINED = "stained"
    SLIDE_SENT = "slide sent"
    PENDING_DIAGNOSIS = "pending diagnosis"
    PENDING_STAIN = "pending special stains"
    PENDING_IHC = "pending immuno"
    PENDING_REVIEW = "pending peer review"
    SIGNED_OUT = "signed out"
    PENDING_ADDENDUM = "pending addendum"
    ADDENDUM_SIGNED = "addendum signed"
    CANCELLED = "cancelled"
