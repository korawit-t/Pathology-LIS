"""Free-text case finder across surgical specimens + diagnoses.

The report this backs answers "how many cases with a <colon, biopsy> specimen
were diagnosed <adenocarcinoma>?". Matching is deliberately done at the *case*
level with two EXISTS sub-queries rather than joining specimen to diagnosis:
a case registered in `integrated`/`clean` diagnosis mode carries a single
case-level diagnosis with no `surgical_specimen_id`, so a specimen->diagnosis
join would silently drop exactly the cases most likely to be cancer resections.
The trade-off is that a multi-specimen case matches when *one* specimen matches
the specimen terms and *some* diagnosis matches the diagnosis terms, even if
they are different specimens — which is why every row carries the specimen
names and diagnosis snippets that matched, for the reader to verify.
"""

import re
from datetime import datetime, time
from typing import Iterable, List, Optional, Sequence, Set

from sqlalchemy import and_, exists, func, or_
from sqlalchemy.orm import Session, selectinload

from app.models.organization import Hospital
from app.models.patient import Patient
from app.models.surgical_case import SurgicalCase
from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_specimen import SurgicalSpecimen
from app.utils.html_text import html_or_plain_text_to_lines
from app.utils.patient_name import full_patient_name

# A single query is a reporting tool, not a bulk-export endpoint: both caps are
# there so a one-character term like "a" cannot turn into a 50k-row spreadsheet.
MAX_TERMS = 10
MAX_TERM_LENGTH = 100
MAX_ROWS = 2000
# How much of a matched diagnosis to carry into the table/export. Full diagnoses
# run to paragraphs; the point here is to show enough to confirm the hit.
SNIPPET_LENGTH = 300


def normalize_terms(raw_terms: Optional[Iterable[str]]) -> List[str]:
    """Trim, drop blanks, de-duplicate case-insensitively, and cap."""
    out: List[str] = []
    seen: Set[str] = set()
    for raw in raw_terms or []:
        term = (raw or "").strip()[:MAX_TERM_LENGTH]
        if not term:
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(term)
        if len(out) >= MAX_TERMS:
            break
    return out


def _like_pattern(term: str) -> str:
    """Escape LIKE wildcards so a term containing % or _ matches literally."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _text_condition(columns: Sequence, terms: Sequence[str], match_mode: str):
    """Build "every term appears" / "any term appears" over one or more columns.

    A term counts as present when it appears in *any* of the given columns, so
    including gross description widens where a term may be found without
    changing the all/any semantics between terms.
    """
    per_term = []
    for term in terms:
        pattern = _like_pattern(term)
        per_term.append(or_(*[col.ilike(pattern, escape="\\") for col in columns]))
    if not per_term:
        return None
    return and_(*per_term) if match_mode == "all" else or_(*per_term)


def _date_column(date_field: str):
    return SurgicalCase.report_at if date_field == "reported" else SurgicalCase.registered_at


def _snippet(raw: Optional[str]) -> str:
    text = html_or_plain_text_to_lines(raw)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > SNIPPET_LENGTH:
        return text[:SNIPPET_LENGTH].rstrip() + "…"
    return text


def _build_filters(
    *,
    specimen_terms: Sequence[str],
    diagnosis_terms: Sequence[str],
    match_mode: str,
    include_gross: bool,
    include_microscopic: bool,
    date_field: str,
    date_from=None,
    date_to=None,
    hospital_id: Optional[int] = None,
    only_reported: bool = True,
    scoped_hospital_ids: Optional[Set[int]] = None,
) -> list:
    filters = [SurgicalCase.is_cancelled == False]  # noqa: E712

    if only_reported:
        filters.append(SurgicalCase.is_reported == True)  # noqa: E712

    date_col = _date_column(date_field)
    if date_from:
        filters.append(date_col >= datetime.combine(date_from, time.min))
    if date_to:
        filters.append(date_col <= datetime.combine(date_to, time.max))
    if date_from or date_to:
        # report_at is null until sign-out; an explicit date window on it must
        # not let those rows through on a null comparison.
        filters.append(date_col.isnot(None))

    if hospital_id is not None:
        filters.append(SurgicalCase.hospital_id == hospital_id)
    if scoped_hospital_ids is not None:
        # Empty set => this user has no hospital, so no case may match.
        filters.append(SurgicalCase.hospital_id.in_(scoped_hospital_ids or {-1}))

    specimen_cols = [SurgicalSpecimen.specimen_name]
    if include_gross:
        specimen_cols.append(SurgicalSpecimen.gross_description)
    specimen_cond = _text_condition(specimen_cols, specimen_terms, match_mode)
    if specimen_cond is not None:
        filters.append(
            exists().where(
                and_(SurgicalSpecimen.case_id == SurgicalCase.id, specimen_cond)
            )
        )

    diagnosis_cols = [SurgicalDiagnosis.diagnosis]
    if include_microscopic:
        diagnosis_cols.append(SurgicalDiagnosis.microscopic_description)
    diagnosis_cond = _text_condition(diagnosis_cols, diagnosis_terms, match_mode)
    if diagnosis_cond is not None:
        filters.append(
            exists().where(
                and_(
                    SurgicalDiagnosis.case_id == SurgicalCase.id,
                    # Revised/addendum rows are kept alongside the original, so
                    # all live versions are searchable; only cancelled ones are
                    # excluded.
                    or_(
                        SurgicalDiagnosis.status.is_(None),
                        SurgicalDiagnosis.status != "cancelled",
                    ),
                    diagnosis_cond,
                )
            )
        )

    return filters


def _matched_specimens_by_case(
    db: Session,
    case_ids: Sequence[int],
    specimen_terms: Sequence[str],
    match_mode: str,
    include_gross: bool,
) -> dict:
    if not case_ids:
        return {}
    cols = [SurgicalSpecimen.specimen_name]
    if include_gross:
        cols.append(SurgicalSpecimen.gross_description)
    cond = _text_condition(cols, specimen_terms, match_mode)

    query = db.query(
        SurgicalSpecimen.case_id,
        SurgicalSpecimen.specimen_label,
        SurgicalSpecimen.specimen_name,
    ).filter(SurgicalSpecimen.case_id.in_(case_ids))
    if cond is not None:
        query = query.filter(cond)

    out: dict = {}
    for case_id, label, name in query.order_by(
        SurgicalSpecimen.case_id, SurgicalSpecimen.specimen_label
    ).all():
        text = f"{label}: {name}" if label else (name or "")
        out.setdefault(case_id, []).append(text)
    return out


def _matched_diagnoses_by_case(
    db: Session,
    case_ids: Sequence[int],
    diagnosis_terms: Sequence[str],
    match_mode: str,
    include_microscopic: bool,
) -> dict:
    if not case_ids:
        return {}
    cols = [SurgicalDiagnosis.diagnosis]
    if include_microscopic:
        cols.append(SurgicalDiagnosis.microscopic_description)
    cond = _text_condition(cols, diagnosis_terms, match_mode)

    query = db.query(
        SurgicalDiagnosis.case_id,
        SurgicalDiagnosis.diagnosis,
    ).filter(
        SurgicalDiagnosis.case_id.in_(case_ids),
        or_(
            SurgicalDiagnosis.status.is_(None),
            SurgicalDiagnosis.status != "cancelled",
        ),
    )
    if cond is not None:
        query = query.filter(cond)

    out: dict = {}
    seen: dict = {}
    for case_id, diagnosis in query.order_by(
        SurgicalDiagnosis.case_id, SurgicalDiagnosis.id
    ).all():
        snippet = _snippet(diagnosis)
        if not snippet:
            continue
        # Specimen-level diagnoses in a resection often repeat verbatim.
        bucket = seen.setdefault(case_id, set())
        if snippet in bucket:
            continue
        bucket.add(snippet)
        out.setdefault(case_id, []).append(snippet)
    return out


def search_cases(
    db: Session,
    *,
    specimen_terms: Optional[Iterable[str]] = None,
    diagnosis_terms: Optional[Iterable[str]] = None,
    match_mode: str = "all",
    include_gross: bool = False,
    include_microscopic: bool = False,
    date_field: str = "registered",
    date_from=None,
    date_to=None,
    hospital_id: Optional[int] = None,
    only_reported: bool = True,
    scoped_hospital_ids: Optional[Set[int]] = None,
    limit: int = MAX_ROWS,
) -> dict:
    """Return {total, malignant_count, items} for the given text conditions.

    `total` is the real match count; `items` is capped at `limit` so a loose
    query degrades into a truncated list rather than an unusable payload.
    """
    spec_terms = normalize_terms(specimen_terms)
    diag_terms = normalize_terms(diagnosis_terms)

    filters = _build_filters(
        specimen_terms=spec_terms,
        diagnosis_terms=diag_terms,
        match_mode=match_mode,
        include_gross=include_gross,
        include_microscopic=include_microscopic,
        date_field=date_field,
        date_from=date_from,
        date_to=date_to,
        hospital_id=hospital_id,
        only_reported=only_reported,
        scoped_hospital_ids=scoped_hospital_ids,
    )

    total = db.query(func.count(SurgicalCase.id)).filter(*filters).scalar() or 0
    malignant_count = (
        db.query(func.count(SurgicalCase.id))
        .filter(*filters, SurgicalCase.has_malignancy == True)  # noqa: E712
        .scalar()
        or 0
    )

    date_col = _date_column(date_field)
    cases = (
        db.query(SurgicalCase)
        .options(
            selectinload(SurgicalCase.patient).selectinload(Patient.title),
            selectinload(SurgicalCase.hospital),
            selectinload(SurgicalCase.pathologist),
        )
        .filter(*filters)
        .order_by(date_col.desc().nullslast(), SurgicalCase.id.desc())
        .limit(max(1, min(limit, MAX_ROWS)))
        .all()
    )

    case_ids = [c.id for c in cases]
    specimens_map = _matched_specimens_by_case(
        db, case_ids, spec_terms, match_mode, include_gross
    )
    diagnoses_map = _matched_diagnoses_by_case(
        db, case_ids, diag_terms, match_mode, include_microscopic
    )

    items = []
    for c in cases:
        items.append(
            {
                "case_id": c.id,
                "accession_no": c.accession_no,
                "hn": c.hn,
                "patient_name": full_patient_name(c.patient, default="-"),
                "gender": c.patient.gender if c.patient else None,
                "hospital_name": c.hospital.name if c.hospital else None,
                "registered_at": c.registered_at,
                "report_at": c.report_at,
                "status": c.status,
                "is_reported": bool(c.is_reported),
                "has_malignancy": c.has_malignancy,
                "pathologist_name": c.pathologist.full_name if c.pathologist else None,
                "matched_specimens": specimens_map.get(c.id, []),
                "matched_diagnoses": diagnoses_map.get(c.id, []),
            }
        )

    return {"total": total, "malignant_count": malignant_count, "items": items}


def resolve_hospital_name(db: Session, hospital_id: Optional[int]) -> Optional[str]:
    if hospital_id is None:
        return None
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    return hospital.name if hospital else None
