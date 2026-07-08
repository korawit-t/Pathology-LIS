# B608 (hardcoded_sql_expressions): WHERE clauses are built by _case_where() and
# _legacy_where() using only SQLAlchemy :named params — no user input is ever
# interpolated directly. Each text() call below is marked # nosec B608.
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional


def _params(search: Optional[str], hospital_ids: Optional[List[int]], clinician: Optional[str]):
    p = {}
    if search:
        p["pat"] = f"%{search}%"
    if clinician:
        p["clinician"] = f"%{clinician}%"
    if hospital_ids is not None:
        p["hospital_ids"] = list(hospital_ids)
    return p


def _case_where(search, hospital_ids, clinician, ca="c", pa="p"):
    """WHERE for case-table queries (ca = case alias, pa = patient alias)."""
    conds = []
    if search:
        conds.append(
            f"({ca}.accession_no ILIKE :pat OR {pa}.name ILIKE :pat"
            f" OR {ca}.hn ILIKE :pat OR {pa}.ln ILIKE :pat)"
        )
    if clinician:
        conds.append(f"{ca}.clinician_name ILIKE :clinician")
    if hospital_ids is not None:
        conds.append(f"{ca}.hospital_id = ANY(:hospital_ids)")
    return ("WHERE " + " AND ".join(conds)) if conds else ""


def _legacy_where(search, hospital_ids, clinician):
    """WHERE for legacy flat-report tables."""
    conds = []
    if search:
        conds.append(
            "(accession_no ILIKE :pat OR patient_name ILIKE :pat"
            " OR patient_hn ILIKE :pat OR patient_ln ILIKE :pat)"
        )
    if clinician:
        conds.append("clinician_name ILIKE :clinician")
    if hospital_ids is not None:
        conds.append("hospital_id = ANY(:hospital_ids)")
    return ("WHERE " + " AND ".join(conds)) if conds else ""


def get_surgical_archive(
    db: Session,
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    hospital_ids: Optional[List[int]] = None,
    clinician: Optional[str] = None,
):
    params = _params(search, hospital_ids, clinician)
    params["limit"] = size
    params["offset"] = (page - 1) * size

    cw = _case_where(search, hospital_ids, clinician)
    lw = _legacy_where(search, hospital_ids, clinician)

    count_sql = text(f"""
        SELECT COUNT(*) FROM (
            SELECT c.id
            FROM surgical_cases c
            JOIN patients p ON c.patient_id = p.id
            LEFT JOIN hospitals h ON c.hospital_id = h.id
            LEFT JOIN departments d ON c.department_id = d.id
            {cw}
            UNION ALL
            SELECT id FROM legacy_surgical_reports {lw}
        ) t
    """)  # nosec B608

    data_sql = text(f"""
        SELECT source, id, accession_no, patient_title, patient_name, patient_ln,
               patient_hn, patient_gender, patient_age, hospital_name, department_name,
               clinician_name, pathologist_name, status, date, registered_date,
               NULL::boolean AS has_malignancy,
               NULL::text AS adequacy_text,
               NULL::text AS category_1_text,
               NULL::text AS interpretation,
               specimen
        FROM (
            SELECT
                'current' AS source,
                COALESCE(sr.id, c.id) AS id,
                c.accession_no,
                ti.title AS patient_title,
                p.name AS patient_name,
                p.ln AS patient_ln,
                c.hn AS patient_hn,
                p.gender AS patient_gender,
                CASE WHEN p.birth_date IS NOT NULL
                     THEN EXTRACT(YEAR FROM AGE(NOW(), p.birth_date))::int
                     ELSE NULL END AS patient_age,
                h.name AS hospital_name,
                d.name AS department_name,
                c.clinician_name,
                COALESCE(sr.pathologist_name, '') AS pathologist_name,
                COALESCE(sr.status::text, 'in_progress') AS status,
                COALESCE(sr.published_at, sr.reported_at, c.registered_at) AS date,
                c.registered_at AS registered_date,
                COALESCE(
                    sr.specimen_summary,
                    (SELECT string_agg(ss.specimen_name, ', ' ORDER BY ss.id)
                     FROM surgical_specimens ss WHERE ss.case_id = c.id)
                ) AS specimen
            FROM surgical_cases c
            JOIN patients p ON c.patient_id = p.id
            LEFT JOIN titles ti ON p.title_id = ti.id
            LEFT JOIN hospitals h ON c.hospital_id = h.id
            LEFT JOIN departments d ON c.department_id = d.id
            LEFT JOIN LATERAL (
                SELECT id, status, published_at, reported_at, pathologist_name, specimen_summary
                FROM surgical_reports
                WHERE case_id = c.id AND status <> 'cancelled'
                ORDER BY version_no DESC
                LIMIT 1
            ) sr ON true
            {cw}
            UNION ALL
            SELECT
                'legacy' AS source, id, accession_no, patient_title, patient_name,
                patient_ln, patient_hn, patient_gender, patient_age, hospital_name,
                department_name, clinician_name, pathologist_name,
                COALESCE(status, 'published') AS status,
                COALESCE(published_at, reported_at, created_at) AS date,
                created_at AS registered_date,
                specimen_summary AS specimen
            FROM legacy_surgical_reports {lw}
        ) combined
        ORDER BY date DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """)  # nosec B608

    total = db.execute(count_sql, params).scalar() or 0
    rows = db.execute(data_sql, params).mappings().all()
    return {"items": [dict(r) for r in rows], "total": int(total)}


def get_gyne_archive(
    db: Session,
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    hospital_ids: Optional[List[int]] = None,
    clinician: Optional[str] = None,
):
    params = _params(search, hospital_ids, clinician)
    params["limit"] = size
    params["offset"] = (page - 1) * size

    cw = _case_where(search, hospital_ids, clinician)
    lw = _legacy_where(search, hospital_ids, clinician)

    count_sql = text(f"""
        SELECT COUNT(*) FROM (
            SELECT c.id
            FROM gyne_cytology_cases c
            JOIN patients p ON c.patient_id = p.id
            LEFT JOIN hospitals h ON c.hospital_id = h.id
            {cw}
            UNION ALL
            SELECT id FROM legacy_gyne_cyto_reports {lw}
        ) t
    """)  # nosec B608

    data_sql = text(f"""
        SELECT source, id, accession_no, patient_title, patient_name, patient_ln,
               patient_hn, patient_gender, patient_age, hospital_name, department_name,
               clinician_name, pathologist_name, status, date, registered_date,
               NULL::boolean AS has_malignancy,
               adequacy_text, category_1_text, interpretation,
               specimen, case_id, has_outlab_result
        FROM (
            SELECT
                'current' AS source,
                COALESCE(sr.id, c.id) AS id,
                c.accession_no,
                ti.title AS patient_title,
                p.name AS patient_name,
                p.ln AS patient_ln,
                c.hn AS patient_hn,
                p.gender AS patient_gender,
                CASE WHEN p.birth_date IS NOT NULL
                     THEN EXTRACT(YEAR FROM AGE(NOW(), p.birth_date))::int
                     ELSE NULL END AS patient_age,
                h.name AS hospital_name,
                d.name AS department_name,
                c.clinician_name,
                COALESCE(sr.pathologist_name, '') AS pathologist_name,
                COALESCE(sr.status::text, 'in_progress') AS status,
                COALESCE(sr.published_at, sr.reported_at, c.registered_at) AS date,
                c.registered_at AS registered_date,
                sr.adequacy_text,
                sr.category_1_text,
                sr.interpretation,
                c.specimen_type AS specimen,
                c.id AS case_id,
                (c.is_out_lab AND c.out_lab_result_pdf_path IS NOT NULL) AS has_outlab_result
            FROM gyne_cytology_cases c
            JOIN patients p ON c.patient_id = p.id
            LEFT JOIN titles ti ON p.title_id = ti.id
            LEFT JOIN hospitals h ON c.hospital_id = h.id
            LEFT JOIN departments d ON c.department_id = d.id
            LEFT JOIN LATERAL (
                SELECT id, status, published_at, reported_at, pathologist_name,
                       adequacy_text, category_1_text, interpretation
                FROM gyne_cyto_reports
                WHERE case_id = c.id AND status <> 'cancelled'
                ORDER BY id DESC
                LIMIT 1
            ) sr ON true
            {cw}
            UNION ALL
            SELECT
                'legacy' AS source, id, accession_no, patient_title, patient_name,
                patient_ln, patient_hn, patient_gender, patient_age, hospital_name,
                department_name, clinician_name, pathologist_name,
                COALESCE(status, 'published') AS status,
                COALESCE(published_at, reported_at, created_at) AS date,
                created_at AS registered_date,
                adequacy_text, category_1_text, interpretation,
                NULL::text AS specimen,
                NULL::int AS case_id,
                false AS has_outlab_result
            FROM legacy_gyne_cyto_reports {lw}
        ) combined
        ORDER BY date DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """)  # nosec B608

    total = db.execute(count_sql, params).scalar() or 0
    rows = db.execute(data_sql, params).mappings().all()
    return {"items": [dict(r) for r in rows], "total": int(total)}


def get_nongyne_archive(
    db: Session,
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    hospital_ids: Optional[List[int]] = None,
    clinician: Optional[str] = None,
):
    params = _params(search, hospital_ids, clinician)
    params["limit"] = size
    params["offset"] = (page - 1) * size

    cw = _case_where(search, hospital_ids, clinician)
    lw = _legacy_where(search, hospital_ids, clinician)

    count_sql = text(f"""
        SELECT COUNT(*) FROM (
            SELECT c.id
            FROM nongyne_cytology_cases c
            JOIN patients p ON c.patient_id = p.id
            LEFT JOIN hospitals h ON c.hospital_id = h.id
            {cw}
            UNION ALL
            SELECT id FROM legacy_nongyne_cyto_reports {lw}
        ) t
    """)  # nosec B608

    data_sql = text(f"""
        SELECT source, id, accession_no, patient_title, patient_name, patient_ln,
               patient_hn, patient_gender, patient_age, hospital_name, department_name,
               clinician_name, pathologist_name, status, date, registered_date,
               has_malignancy,
               NULL::text AS adequacy_text,
               NULL::text AS category_1_text,
               NULL::text AS interpretation,
               specimen
        FROM (
            SELECT
                'current' AS source,
                COALESCE(sr.id, c.id) AS id,
                c.accession_no,
                ti.title AS patient_title,
                p.name AS patient_name,
                p.ln AS patient_ln,
                c.hn AS patient_hn,
                p.gender AS patient_gender,
                CASE WHEN p.birth_date IS NOT NULL
                     THEN EXTRACT(YEAR FROM AGE(NOW(), p.birth_date))::int
                     ELSE NULL END AS patient_age,
                h.name AS hospital_name,
                d.name AS department_name,
                c.clinician_name,
                COALESCE(sr.pathologist_name, '') AS pathologist_name,
                COALESCE(sr.status::text, 'in_progress') AS status,
                COALESCE(sr.published_at, sr.reported_at, c.registered_at) AS date,
                c.registered_at AS registered_date,
                COALESCE(sr.has_malignancy, false) AS has_malignancy,
                c.specimen_type AS specimen,
                c.collection_site
            FROM nongyne_cytology_cases c
            JOIN patients p ON c.patient_id = p.id
            LEFT JOIN titles ti ON p.title_id = ti.id
            LEFT JOIN hospitals h ON c.hospital_id = h.id
            LEFT JOIN departments d ON c.department_id = d.id
            LEFT JOIN LATERAL (
                SELECT id, status, published_at, reported_at, pathologist_name, has_malignancy
                FROM nongyne_cyto_reports
                WHERE case_id = c.id AND status <> 'cancelled'
                ORDER BY id DESC
                LIMIT 1
            ) sr ON true
            {cw}
            UNION ALL
            SELECT
                'legacy' AS source, id, accession_no, patient_title, patient_name,
                patient_ln, patient_hn, patient_gender, patient_age, hospital_name,
                department_name, clinician_name, pathologist_name,
                COALESCE(status, 'published') AS status,
                COALESCE(published_at, reported_at, created_at) AS date,
                created_at AS registered_date,
                has_malignancy,
                specimen_type AS specimen,
                NULL AS collection_site
            FROM legacy_nongyne_cyto_reports {lw}
        ) combined
        ORDER BY date DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """)  # nosec B608

    total = db.execute(count_sql, params).scalar() or 0
    rows = db.execute(data_sql, params).mappings().all()
    return {"items": [dict(r) for r in rows], "total": int(total)}
