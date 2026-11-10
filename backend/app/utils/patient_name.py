"""Patient display-name assembly.

Patient.name holds the *first name only*, so rendering it on its own drops both
the title and the surname — which reads as a different person to whoever is
looking at it. Anything that shows a patient to a human goes through here.
"""

import unicodedata


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


_MASK = "***"


def _letters(word: str) -> list:
    """Split a word into letters as a reader counts them: each base character
    with the marks written on it, so "สุดา" is สุ·ด·า, not ส·ุ·ด·า. Thai
    above/below vowels and tone marks are Unicode nonspacing marks (Mn)."""
    letters: list = []
    for ch in word:
        if letters and unicodedata.category(ch).startswith("M"):
            letters[-1] += ch
        else:
            letters.append(ch)
    return letters


def _mask_word(word: str) -> str:
    """First two letters, then a fixed "***" — fixed so the mask doesn't give
    away the name's length. A word of two letters or fewer keeps fewer, so at
    least one letter is always hidden."""
    letters = _letters(word)
    keep = min(2, len(letters) - 1)
    return "".join(letters[:keep]) + _MASK


def mask_person_name(full_name, default: str = "-") -> str:
    """"นาย สมชาย ใจดี" → "นาย สม*** ใจ***" — title kept, first name and
    surname each cut to their first two letters.

    For notification templates ({name_short}, {clinician_short}) that go to a
    group chat, where the reader doesn't need the full name.
    """
    tokens = str(full_name or "").split()
    if not tokens or tokens == ["-"]:
        return default
    title, rest = _split_title(tokens)
    masked = [_mask_word(word) for word in rest]
    return " ".join([*([title] if title else []), *masked]) or default
