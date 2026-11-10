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


# Titles written without a trailing dot. Anything ending in "." (นพ., พญ.,
# ด.ช., น.ส., ร.ต.อ., Dr.) is recognised as a title by the dot alone.
_UNDOTTED_TITLES = frozenset({
    "นาย", "นาง", "นางสาว", "เด็กชาย", "เด็กหญิง",
    "mr", "mrs", "ms", "miss", "dr",
})


def _split_title(tokens: list) -> tuple:
    """(title, remaining tokens). Also splits a title glued to the first name
    ("พญ.สุดา" → "พญ.", "สุดา"), which is how clinician names are often typed."""
    if not tokens:
        return "", tokens
    first = tokens[0]
    if first.lower().rstrip(".") in _UNDOTTED_TITLES or first.endswith("."):
        return first, tokens[1:]
    if "." in first:
        cut = first.rindex(".") + 1
        return first[:cut], [first[cut:], *tokens[1:]]
    return "", tokens


def short_person_name(full_name, default: str = "-") -> str:
    """"นาย สมชาย ใจดี" → "นาย สมชาย ใ." — title and first name kept, surname
    cut to its first letter.

    For notification templates ({name_short}, {clinician_short}) that go to a
    group chat, where the full name is more than the reader needs. With no
    surname to shorten ("นาย สมชาย") the name comes back unchanged.
    """
    tokens = str(full_name or "").split()
    if not tokens or tokens == ["-"]:
        return default
    title, rest = _split_title(tokens)
    if len(rest) < 2:
        return " ".join([title, *rest]).strip() or default
    *given, surname = rest
    return " ".join([*([title] if title else []), *given, f"{surname[0]}."])
