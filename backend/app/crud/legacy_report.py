# B608 (hardcoded_sql_expressions): the SQL below is put together from the
# constant table names and column expressions in _SEARCH_SOURCES and the
# fixed WHERE fragments in _search_where(). Every user value (q, hospital_id,
# skip, limit) is bound as a :named parameter, never put into the string.
# Each text() call is marked # nosec B608.
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# (table, case_type, registered_at, is_pending). Gyne and non-gyne have no
# registered_at column, and the search has always shown reported_at there;
# gyne has no is_pending either.
_SEARCH_SOURCES = (
    ("legacy_surgical_reports", "SURGICAL", "registered_at", "COALESCE(is_pending, false)"),
    ("legacy_gyne_cyto_reports", "GYNE", "reported_at", "false"),
    ("legacy_nongyne_cyto_reports", "NONGYNE", "reported_at", "COALESCE(is_pending, false)"),
)


def _search_where(q: Optional[str], hospital_id: Optional[int]) -> str:
    conds = ["status = 'published'"]
    if q:
        conds.append(
            "(accession_no ILIKE :pat OR patient_hn ILIKE :pat OR patient_name ILIKE :pat)"
        )
    if hospital_id is not None:
        conds.append("hospital_id = :hospital_id")
    return "WHERE " + " AND ".join(conds)


def _search_union(where: str) -> str:
    return "\nUNION ALL\n".join(
        f"""
        SELECT '{case_type}' AS case_type, id, accession_no, patient_hn,
               patient_title, patient_name, patient_ln, published_at, reported_at,
               {registered_at} AS registered_at, clinician_name, pathologist_name,
               hospital_name, is_read, read_at, {is_pending} AS is_pending,
               COALESCE(published_at, reported_at) AS sort_at
        FROM {table} {where}
        """  # nosec B608
        for table, case_type, registered_at, is_pending in _SEARCH_SOURCES
    )


def search_legacy_reports(
    db: Session,
    q: Optional[str] = None,
    hospital_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 10,
) -> dict:
    """Published legacy reports of all three case types, newest first.

    Sorted by published_at, else reported_at; rows with neither come last.
    Paged in the database, so a search never loads every match."""
    params: dict = {"limit": limit, "offset": skip}
    if q:
        params["pat"] = f"%{q}%"
    if hospital_id is not None:
        params["hospital_id"] = hospital_id

    union = _search_union(_search_where(q, hospital_id))
    total = db.execute(
        text(f"SELECT COUNT(*) FROM ({union}) u"),  # nosec B608
        params,
    ).scalar() or 0
    rows = db.execute(
        text(f"""
            SELECT * FROM ({union}) u
            ORDER BY sort_at DESC NULLS LAST, id DESC, case_type
            LIMIT :limit OFFSET :offset
        """),  # nosec B608
        params,
    ).mappings().all()

    items = [
        {
            "id": r["id"],
            "case_type": r["case_type"],
            "accession_no": r["accession_no"],
            "patient_hn": r["patient_hn"],
            "patient_title": r["patient_title"],
            "patient_name": r["patient_name"],
            "patient_ln": r["patient_ln"],
            "status": "published",
            "published_at": r["published_at"],
            "reported_at": r["reported_at"],
            "registered_at": r["registered_at"],
            "clinician_name": r["clinician_name"],
            "pathologist_name": r["pathologist_name"],
            "hospital_name": r["hospital_name"],
            "is_read": r["is_read"],
            "read_at": r["read_at"],
            "report_id": r["id"],
            "is_pending": r["is_pending"],
        }
        for r in rows
    ]
    return {"items": items, "total": int(total)}
