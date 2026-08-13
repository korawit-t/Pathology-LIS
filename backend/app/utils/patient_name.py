"""Patient display-name assembly.

Patient.name holds the *first name only*, so rendering it on its own drops both
the title and the surname — which reads as a different person to whoever is
looking at it. Anything that shows a patient to a human goes through here.
"""


def full_patient_name(patient, default: str = "") -> str:
    """"นาย สมชาย ใจดี" — title + name + ln, skipping whatever is missing."""
    if not patient:
        return default
    title = patient.title.title if getattr(patient, "title", None) else ""
    parts = (title, patient.name or "", patient.ln or "")
    return " ".join(p for p in parts if p) or default
