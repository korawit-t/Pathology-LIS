from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.nongyne_cyto_histo_correlation import NongyneCytoHistoCorrelation
from app.models.nongyne_cyto_case import NongyneCytologyCase
from app.models.nongyne_diagnosis import NongyneDiagnosis
from app.models.gyne_cyto_case import GyneCytologyCase
from app.models.gyne_diagnosis import GyneDiagnosis
from app.schemas.cyto_histo_correlation import CorrelationCreate, CorrelationUpdate

EXCLUDE_STATUSES = {"registered", "cancelled"}


def _serialize_correlation(c: NongyneCytoHistoCorrelation) -> dict:
    acc = None
    if c.gyne_case:
        acc = c.gyne_case.accession_no
    elif c.nongyne_case:
        acc = c.nongyne_case.accession_no
    return {
        "id": c.id,
        "case_type": c.case_type,
        "nongyne_case_id": c.nongyne_case_id,
        "gyne_case_id": c.gyne_case_id,
        "cytology_accession_no": acc,
        "surgical_accession_no": c.surgical_accession_no,
        "cytology_diagnosis_snapshot": c.cytology_diagnosis_snapshot,
        "histology_diagnosis": c.histology_diagnosis,
        "correlation_result": c.correlation_result,
        "comment": c.comment,
        "correlated_by": {
            "id": c.correlated_by.id,
            "full_name": c.correlated_by.full_name,
        } if c.correlated_by else None,
        "correlated_at": c.correlated_at,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


def list_correlations(db: Session, skip: int = 0, limit: int = 20,
                      result: str = None, start_date=None, end_date=None, case_type: str = None):
    from app.models.gyne_cyto_report import GyneCytoReport
    from app.models.nongyne_cyto_report import NongyneCytoReport
    from app.models.surgical_report import SurgicalReport
    from sqlalchemy import func

    q = db.query(NongyneCytoHistoCorrelation)
    if result:
        q = q.filter(NongyneCytoHistoCorrelation.correlation_result == result)
    if case_type:
        q = q.filter(NongyneCytoHistoCorrelation.case_type == case_type)
    if start_date:
        q = q.filter(NongyneCytoHistoCorrelation.correlated_at >= start_date)
    if end_date:
        from datetime import datetime, time
        q = q.filter(NongyneCytoHistoCorrelation.correlated_at <= datetime.combine(end_date, time.max))
    total = q.count()
    rows = q.order_by(NongyneCytoHistoCorrelation.correlated_at.desc()).offset(skip).limit(limit).all()

    # Batch-fetch latest published report IDs for cytology and surgical cases
    gyne_ids    = [r.gyne_case_id    for r in rows if r.gyne_case_id]
    nongyne_ids = [r.nongyne_case_id for r in rows if r.nongyne_case_id]
    surg_ids    = [r.surgical_case_id for r in rows if r.surgical_case_id]

    gyne_report_map: dict[int, int] = {}
    if gyne_ids:
        subq = (db.query(GyneCytoReport.case_id, func.max(GyneCytoReport.id).label("max_id"))
                .filter(GyneCytoReport.case_id.in_(gyne_ids), GyneCytoReport.status == "published")
                .group_by(GyneCytoReport.case_id).subquery())
        gyne_report_map = {row.case_id: row.max_id for row in db.query(subq).all()}

    nongyne_report_map: dict[int, int] = {}
    if nongyne_ids:
        subq = (db.query(NongyneCytoReport.case_id, func.max(NongyneCytoReport.id).label("max_id"))
                .filter(NongyneCytoReport.case_id.in_(nongyne_ids), NongyneCytoReport.status == "published")
                .group_by(NongyneCytoReport.case_id).subquery())
        nongyne_report_map = {row.case_id: row.max_id for row in db.query(subq).all()}

    surg_report_map: dict[int, int] = {}
    if surg_ids:
        subq = (db.query(SurgicalReport.case_id, func.max(SurgicalReport.id).label("max_id"))
                .filter(SurgicalReport.case_id.in_(surg_ids),
                        SurgicalReport.status.in_(["published", "completed"]))
                .group_by(SurgicalReport.case_id).subquery())
        surg_report_map = {row.case_id: row.max_id for row in db.query(subq).all()}

    def _with_reports(c: NongyneCytoHistoCorrelation) -> dict:
        base = _serialize_correlation(c)
        cyto_report_id = (
            gyne_report_map.get(c.gyne_case_id) if c.gyne_case_id
            else nongyne_report_map.get(c.nongyne_case_id) if c.nongyne_case_id
            else None
        )
        base["cytology_report_id"] = cyto_report_id
        base["surgical_report_id"] = surg_report_map.get(c.surgical_case_id) if c.surgical_case_id else None
        return base

    return {"items": [_with_reports(r) for r in rows], "total": total}


def get_surgical_context(db: Session, patient_id: int, surgical_accession_no: str):
    """Return ALL cytology cases (gyne + nongyne) for a patient with their diagnosis + any correlation."""

    # ── Non-Gyne cases ──────────────────────────────────────────────────────
    ng_cases = (
        db.query(NongyneCytologyCase)
        .filter(NongyneCytologyCase.patient_id == patient_id,
                NongyneCytologyCase.status.notin_(EXCLUDE_STATUSES))
        .order_by(NongyneCytologyCase.registered_at.desc())
        .all()
    )
    ng_ids = [c.id for c in ng_cases]
    ng_diags = {d.case_id: d for d in db.query(NongyneDiagnosis)
        .filter(NongyneDiagnosis.case_id.in_(ng_ids), NongyneDiagnosis.is_current.is_(True)).all()} if ng_ids else {}

    # ── Gyne cases ──────────────────────────────────────────────────────────
    g_cases = (
        db.query(GyneCytologyCase)
        .filter(GyneCytologyCase.patient_id == patient_id,
                GyneCytologyCase.status.notin_(EXCLUDE_STATUSES))
        .order_by(GyneCytologyCase.registered_at.desc())
        .all()
    )
    g_ids = [c.id for c in g_cases]
    g_diags = {d.case_id: d for d in db.query(GyneDiagnosis)
        .filter(GyneDiagnosis.case_id.in_(g_ids), GyneDiagnosis.is_current.is_(True)).all()} if g_ids else {}

    if not ng_ids and not g_ids:
        return []

    # ── Existing correlations for this surgical accession ───────────────────
    correlations = (
        db.query(NongyneCytoHistoCorrelation)
        .filter(
            NongyneCytoHistoCorrelation.surgical_accession_no == surgical_accession_no,
            or_(
                NongyneCytoHistoCorrelation.nongyne_case_id.in_(ng_ids) if ng_ids else False,
                NongyneCytoHistoCorrelation.gyne_case_id.in_(g_ids) if g_ids else False,
            )
        )
        .all()
    )
    ng_corr_map = {c.nongyne_case_id: c for c in correlations if c.case_type == "nongyne"}
    g_corr_map  = {c.gyne_case_id: c  for c in correlations if c.case_type == "gyne"}

    result = []

    for case in ng_cases:
        diag = ng_diags.get(case.id)
        corr = ng_corr_map.get(case.id)
        result.append({
            "case_type": "nongyne",
            "nongyne_case": {
                "id": case.id, "accession_no": case.accession_no,
                "specimen_type": case.specimen_type, "collection_site": case.collection_site,
                "registered_at": case.registered_at, "status": case.status,
            },
            "cytology_diagnosis": diag.diagnosis if diag else None,
            "correlation": _serialize_correlation(corr) if corr else None,
        })

    for case in g_cases:
        diag = g_diags.get(case.id)
        corr = g_corr_map.get(case.id)
        # gyne diagnosis: use interpretation or category text as the snapshot text
        dx_text = None
        if diag:
            parts = [p for p in [diag.category_1_text if hasattr(diag, 'category_1_text') else None,
                                  diag.category_2_text if hasattr(diag, 'category_2_text') else None,
                                  diag.interpretation if hasattr(diag, 'interpretation') else None] if p]
            dx_text = " / ".join(parts) if parts else None
        result.append({
            "case_type": "gyne",
            "nongyne_case": {
                "id": case.id, "accession_no": case.accession_no,
                "specimen_type": case.specimen_type or "Gyne Cytology",
                "collection_site": case.collection_site,
                "registered_at": case.registered_at, "status": case.status,
            },
            "cytology_diagnosis": dx_text,
            "correlation": _serialize_correlation(corr) if corr else None,
        })

    result.sort(key=lambda x: x["nongyne_case"]["registered_at"] or "", reverse=True)
    return result


def get_by_nongyne_case(db: Session, case_id: int):
    rows = (db.query(NongyneCytoHistoCorrelation)
        .filter(NongyneCytoHistoCorrelation.nongyne_case_id == case_id)
        .order_by(NongyneCytoHistoCorrelation.correlated_at.desc()).all())
    return [_serialize_correlation(r) for r in rows]


def get_by_gyne_case(db: Session, case_id: int):
    rows = (db.query(NongyneCytoHistoCorrelation)
        .filter(NongyneCytoHistoCorrelation.gyne_case_id == case_id)
        .order_by(NongyneCytoHistoCorrelation.correlated_at.desc()).all())
    return [_serialize_correlation(r) for r in rows]


def create_correlation(db: Session, payload: CorrelationCreate, current_user_id: int):
    obj = NongyneCytoHistoCorrelation(
        case_type=payload.case_type,
        nongyne_case_id=payload.nongyne_case_id if payload.case_type == "nongyne" else None,
        gyne_case_id=payload.gyne_case_id if payload.case_type == "gyne" else None,
        surgical_accession_no=payload.surgical_accession_no,
        surgical_case_id=payload.surgical_case_id,
        cytology_diagnosis_snapshot=payload.cytology_diagnosis_snapshot,
        histology_diagnosis=payload.histology_diagnosis,
        correlation_result=payload.correlation_result,
        comment=payload.comment,
        correlated_by_id=current_user_id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _serialize_correlation(obj)


def update_correlation(db: Session, correlation_id: int, payload: CorrelationUpdate):
    obj = db.query(NongyneCytoHistoCorrelation).filter(NongyneCytoHistoCorrelation.id == correlation_id).first()
    if not obj:
        return None
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return _serialize_correlation(obj)


def delete_correlation(db: Session, correlation_id: int) -> bool:
    obj = db.query(NongyneCytoHistoCorrelation).filter(NongyneCytoHistoCorrelation.id == correlation_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# category_2 codes that represent HSIL or above (Bethesda 2014)
_HSIL_OR_ABOVE_CODES = {
    "305",                                   # ASC-H
    "309", "310", "311", "312", "313",       # HSIL variants
    "314",                                   # SCC
    "315", "316", "317", "318", "319",       # Atypical glandular
    "320", "321", "322", "323", "324",       # AIS / Adenocarcinoma
    "325", "326", "327", "328",              # Other malignant
}


# Diagnosis groups ordered as they appear in the report (Bethesda 2014 order)
_DIAG_GROUPS: list[tuple[str, str, frozenset | None]] = [
    ("unsatisfactory", "Unsatisfactory",             None),  # handled by is_satisfied_specimen flag
    ("nilm",           "NILM",                       frozenset(str(c) for c in range(100, 300))),
    ("asc_us",         "ASC-US",                     frozenset({"301", "302", "303", "304"})),
    ("asc_h",          "ASC-H",                      frozenset({"305"})),
    ("lsil",           "LSIL",                       frozenset({"306", "307", "308"})),
    ("hsil",           "HSIL",                       frozenset({"309", "310", "311", "312", "313"})),
    ("scc",            "Squamous Cell Carcinoma",     frozenset({"314"})),
    ("agc",            "Atypical Glandular Cells",   frozenset({"315", "316", "317", "318", "319"})),
    ("ais",            "AIS",                        frozenset({"320"})),
    ("adenocarcinoma", "Adenocarcinoma",             frozenset({"321", "322", "323", "324"})),
    ("malignant",      "Other malignant",            frozenset({"325", "326", "327", "328"})),
    ("other",          "อื่นๆ / ไม่ระบุ",              None),  # catch-all
]

_HSIL_GROUP_KEYS = {"asc_h", "hsil", "scc", "agc", "ais", "adenocarcinoma", "malignant"}


def _classify_gyne_group(
    is_satisfied_specimen: bool | None, code: str | None, category_1_code: str | None = None
) -> str:
    """Map a case's adequacy flag + category_2 code to a `_DIAG_GROUPS` key.

    Falls back to the category_1 header code (e.g. "100" NILM, "200" NILM w/ organism)
    when no category_2 sub-finding was picked, since category_1 codes 100-299 already
    fall within the NILM range.
    """
    if is_satisfied_specimen is False:
        return "unsatisfactory"
    effective_code = code or category_1_code
    for gkey, _label, gcodes in _DIAG_GROUPS:
        if gkey in ("unsatisfactory", "other"):
            continue
        if gcodes and effective_code in gcodes:
            return gkey
    return "other"


def _has_gyne_result(is_satisfied_specimen: bool | None, code: str | None, category_1_code: str | None) -> bool:
    """False when no adequacy/diagnosis result has been issued yet for the case.

    Such cases (still pending screening/reporting) should not be counted anywhere
    in the correlation summary — not registration counts, not the diagnosis breakdown.
    """
    if is_satisfied_specimen is False:
        return True
    return bool(code or category_1_code)


def _gyne_summary_query(db: Session, start_date=None, end_date=None):
    from app.models.gyne_diagnosis import GyneDiagnosis, GyneDiagnosisCategory
    from sqlalchemy import and_, func
    from sqlalchemy.orm import joinedload

    q = (
        db.query(GyneCytologyCase, GyneDiagnosis, GyneDiagnosisCategory)
        .outerjoin(
            GyneDiagnosis,
            and_(GyneDiagnosis.case_id == GyneCytologyCase.id, GyneDiagnosis.is_current.is_(True)),
        )
        .outerjoin(GyneDiagnosisCategory, GyneDiagnosisCategory.id == GyneDiagnosis.category_2_id)
        .options(joinedload(GyneDiagnosis.category_1_obj))
    )
    if start_date:
        q = q.filter(func.date(GyneCytologyCase.registered_at) >= start_date)
    if end_date:
        q = q.filter(func.date(GyneCytologyCase.registered_at) <= end_date)
    return q


def get_correlation_summary(db: Session, start_date=None, end_date=None) -> dict:
    """Detailed Gyne Cytology breakdown (diagnosis × specimen type) plus HSIL+ cyto-histo discordant counts."""
    gyne_q = _gyne_summary_query(db, start_date, end_date)

    def _zero():
        return {"conventional": 0, "liquid_based": 0, "total": 0}

    buckets: dict[str, dict] = {g[0]: _zero() for g in _DIAG_GROUPS}
    grand = _zero()
    reg = {"conventional": 0, "liquid_based": 0, "other": 0, "total": 0}
    hsil_case_ids: set[int] = set()

    for case, diag, cat in gyne_q.all():
        code = cat.code if cat else None
        cat_1_code = diag.category_1_obj.code if diag and diag.category_1_obj else None
        if not _has_gyne_result(case.is_satisfied_specimen, code, cat_1_code):
            continue  # no adequacy/diagnosis result issued yet — exclude entirely

        specimen = (case.specimen_type or "").lower()
        is_conv = "conventional" in specimen
        is_liq = "liquid" in specimen or "lbc" in specimen
        spec_key = "conventional" if is_conv else "liquid_based"

        # Registration-based counts (specimen type only, no diagnosis required)
        if is_conv:
            reg["conventional"] += 1
        elif is_liq:
            reg["liquid_based"] += 1
        else:
            reg["other"] += 1
        reg["total"] += 1

        # Classify into a diagnosis group
        group = _classify_gyne_group(case.is_satisfied_specimen, code, cat_1_code)

        buckets[group][spec_key] += 1
        buckets[group]["total"] += 1
        grand[spec_key] += 1
        grand["total"] += 1

        if cat and cat.code in _HSIL_OR_ABOVE_CODES:
            hsil_case_ids.add(case.id)

    # Cyto-histo discordant counts for HSIL+ cases
    hsil_major = 0
    hsil_minor = 0
    if hsil_case_ids:
        for r in (
            db.query(NongyneCytoHistoCorrelation)
            .filter(
                NongyneCytoHistoCorrelation.case_type == "gyne",
                NongyneCytoHistoCorrelation.gyne_case_id.in_(hsil_case_ids),
                NongyneCytoHistoCorrelation.correlation_result.in_(
                    ["major_discrepancy", "minor_discrepancy"]
                ),
            )
            .all()
        ):
            if r.correlation_result == "major_discrepancy":
                hsil_major += 1
            else:
                hsil_minor += 1

    hsil_total = sum(buckets[g]["total"] for g in _HSIL_GROUP_KEYS)

    return {
        "registration_counts": reg,
        "breakdown": [
            {"group": gkey, "label": glabel, **buckets[gkey]}
            for gkey, glabel, _ in _DIAG_GROUPS
        ],
        "grand_total": grand,
        "hsil_total": hsil_total,
        "hsil_major_discordant": hsil_major,
        "hsil_minor_discordant": hsil_minor,
    }


def get_correlation_group_cases(db: Session, group: str, start_date=None, end_date=None) -> list[dict]:
    """List the Gyne Cytology cases behind one `_DIAG_GROUPS` bucket from get_correlation_summary (drill-down)."""
    from app.models.patient import Patient
    from sqlalchemy.orm import joinedload

    if group not in {g[0] for g in _DIAG_GROUPS}:
        return []

    gyne_q = _gyne_summary_query(db, start_date, end_date).options(
        joinedload(GyneCytologyCase.patient).joinedload(Patient.title),
    )

    results = []
    for case, diag, cat in gyne_q.all():
        code = cat.code if cat else None
        cat_1 = diag.category_1_obj if diag else None
        cat_1_code = cat_1.code if cat_1 else None
        if not _has_gyne_result(case.is_satisfied_specimen, code, cat_1_code):
            continue  # no adequacy/diagnosis result issued yet — never shown in a drill-down
        if _classify_gyne_group(case.is_satisfied_specimen, code, cat_1_code) != group:
            continue
        patient = case.patient
        results.append({
            "id": case.id,
            "accession_no": case.accession_no,
            "hn": case.hn,
            "patient_title": patient.title.title if patient and patient.title else None,
            "patient_name": patient.name if patient else None,
            "patient_ln": patient.ln if patient else None,
            "specimen_type": case.specimen_type,
            "registered_at": case.registered_at,
            "is_satisfied_specimen": case.is_satisfied_specimen,
            "category_1_code": cat_1.code if cat_1 else None,
            "category_1_text": cat_1.text if cat_1 else None,
            "category_code": cat.code if cat else None,
            "category_text": cat.text if cat else None,
            "interpretation": diag.interpretation if diag else None,
        })

    results.sort(key=lambda r: r["registered_at"] or "", reverse=True)
    return results
