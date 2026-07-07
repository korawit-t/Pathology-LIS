import io
import base64
from pathlib import Path
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from app.db.database import get_db
from app.models.legacy_surgical_report import LegacySurgicalReport
from app.models.legacy_gyne_cyto_report import LegacyGyneCytoReport
from app.models.legacy_nongyne_cyto_report import LegacyNongyneCytoReport
from app.models.system_setting import SystemSetting
from app.utils.time import local_now
from app.dependencies.auth import get_current_user, assert_hospital_scoped_access
from app.core.roles import CAN_READ_REPORT, CAN_READ_GYNE_CYTO_REPORT, CAN_READ_NONGYNE_CYTO_REPORT

router = APIRouter(prefix="/legacy-reports", tags=["Legacy Reports"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_dict(obj) -> dict:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def _search_filter(model, search: str):
    s = f"%{search}%"
    return or_(
        model.accession_no.ilike(s),
        model.patient_hn.ilike(s),
        model.patient_name.ilike(s),
    )


def _build_legacy_pdf_data(report, db: Session) -> dict:
    data = _to_dict(report)

    # Signers from JSON snapshot
    if report.signers_snapshot:
        data["signers"] = report.signers_snapshot
    else:
        data["signers"] = [{
            "full_name": report.pathologist_name,
            "report_name": report.pathologist_name,
            "role": "primary",
            "signed_at": report.reported_at,
        }]

    # Lab settings
    settings = db.query(SystemSetting).first()
    if settings:
        data["lab_name_snapshot"] = settings.lab_name_th or ""
        data["lab_name_en_snapshot"] = settings.lab_name_en or settings.lab_name_th or ""
        data["lab_address_snapshot"] = settings.lab_address or ""
        data["report_footer_snapshot"] = settings.report_footer_text or ""
        if settings.report_logo_url:
            try:
                storage_root = Path("uploads")
                full_path = storage_root / settings.report_logo_url.removeprefix("/storage/")
                if full_path.exists():
                    with open(full_path, "rb") as f:
                        encoded = base64.b64encode(f.read()).decode("utf-8")
                        ext = full_path.suffix.lower().lstrip(".")
                        data["report_logo_url_snapshot"] = f"data:image/{ext};base64,{encoded}"
                else:
                    data.setdefault("report_logo_url_snapshot", None)
            except Exception:
                data.setdefault("report_logo_url_snapshot", None)
        else:
            data.setdefault("report_logo_url_snapshot", None)
    else:
        data.setdefault("lab_name_snapshot", "")
        data.setdefault("lab_name_en_snapshot", "")
        data.setdefault("lab_address_snapshot", "")
        data.setdefault("report_footer_snapshot", "")
        data.setdefault("report_logo_url_snapshot", None)

    # Computed flags
    data["is_draft"] = False
    data.setdefault("is_pending", getattr(report, "is_pending", False) or False)
    data["all_nongyne_images"] = []

    # Field aliases for template compatibility
    data["diagnosis_summary"] = data.get("diagnosis") or data.get("diagnosis_summary") or ""
    data["gross_description_summary"] = data.get("gross_description") or data.get("gross_description_summary") or ""
    data["microscopic_summary"] = data.get("microscopic_description") or data.get("microscopic_summary") or ""
    data["comment_summary"] = data.get("comment") or data.get("comment_summary") or ""

    data["preview_date"] = local_now().strftime("%d/%m/%Y %H:%M")

    # Patient age display
    bdate = data.get("patient_birth_date")
    if bdate:
        try:
            from datetime import date
            if hasattr(bdate, "date"):
                bdate = bdate.date()
            today = date.today()
            years = today.year - bdate.year - ((today.month, today.day) < (bdate.month, bdate.day))
            data["patient_age_display"] = f"{years} ปี"
        except Exception:
            data["patient_age_display"] = f"{report.patient_age} ปี" if report.patient_age else "-"
    else:
        data["patient_age_display"] = f"{report.patient_age} ปี" if report.patient_age else "-"

    return data


# ── Public unified search (for ResultPage / HospitalResultPage) ───────────────

@router.get("/search", dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)])
def search_legacy_reports(
    q: Optional[str] = Query(None),
    hospital_id: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db),
):
    if q and len(q) < 3:
        return {"items": [], "total": 0}

    results = []
    for model, case_type in [
        (LegacySurgicalReport, "SURGICAL"),
        (LegacyGyneCytoReport, "GYNE"),
        (LegacyNongyneCytoReport, "NONGYNE"),
    ]:
        mq = db.query(model).filter(model.status == "published")
        if q:
            mq = mq.filter(_search_filter(model, q))
        if hospital_id is not None:
            mq = mq.filter(model.hospital_id == hospital_id)
        for r in mq.all():
            results.append({
                "id": r.id,
                "case_type": case_type,
                "accession_no": r.accession_no,
                "patient_hn": r.patient_hn,
                "patient_title": r.patient_title,
                "patient_name": r.patient_name,
                "patient_ln": r.patient_ln,
                "status": "published",
                "published_at": r.published_at,
                "reported_at": r.reported_at,
                "registered_at": getattr(r, "registered_at", r.reported_at),
                "clinician_name": r.clinician_name,
                "pathologist_name": r.pathologist_name,
                "hospital_name": r.hospital_name,
                "is_read": r.is_read,
                "read_at": r.read_at,
                "report_id": r.id,
                "is_pending": getattr(r, "is_pending", False) or False,
            })

    results.sort(
        key=lambda x: x.get("published_at") or x.get("reported_at") or "",
        reverse=True,
    )
    total = len(results)
    return {"items": results[skip: skip + limit], "total": total}


# ── Surgical ─────────────────────────────────────────────────────────────────

@router.get("/surgical", dependencies=[Depends(CAN_READ_REPORT)])
def list_legacy_surgical(
    skip: int = 0,
    limit: int = 20,
    search: Optional[str] = Query(None),
    hospital_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(LegacySurgicalReport)
    if search:
        q = q.filter(_search_filter(LegacySurgicalReport, search))
    if hospital_id is not None:
        q = q.filter(LegacySurgicalReport.hospital_id == hospital_id)
    total = q.count()
    items = q.order_by(LegacySurgicalReport.id.desc()).offset(skip).limit(limit).all()
    return {"items": [_to_dict(r) for r in items], "total": total}


@router.get("/surgical/{report_id}/pdf", dependencies=[Depends(CAN_READ_REPORT)])
def get_legacy_surgical_pdf(report_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = db.query(LegacySurgicalReport).filter(LegacySurgicalReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)
    data = _build_legacy_pdf_data(report, db)
    settings = db.query(SystemSetting).first()
    template = f"reports/{settings.surgical_report_template or 'surgical_report_template.html'}" if settings else "reports/surgical_report_template.html"
    from app.services import pdf_service
    blob = pdf_service.generate_pdf_blob(data, template_name=template, is_preview=False)
    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=legacy_surgical_{report.accession_no}.pdf"},
    )


@router.post("/surgical/{report_id}/mark-read", dependencies=[Depends(get_current_user)])
def mark_legacy_surgical_read(report_id: int, db: Session = Depends(get_db)):
    report = db.query(LegacySurgicalReport).filter(LegacySurgicalReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    report.is_read = True
    report.read_at = local_now()
    db.commit()
    return {"ok": True}


@router.get("/surgical/{report_id}", dependencies=[Depends(CAN_READ_REPORT)])
def get_legacy_surgical(report_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = db.query(LegacySurgicalReport).filter(LegacySurgicalReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)
    return _to_dict(report)


# ── Gyne Cytology ─────────────────────────────────────────────────────────────

@router.get("/gyne", dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)])
def list_legacy_gyne(
    skip: int = 0,
    limit: int = 20,
    search: Optional[str] = Query(None),
    hospital_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(LegacyGyneCytoReport)
    if search:
        q = q.filter(_search_filter(LegacyGyneCytoReport, search))
    if hospital_id is not None:
        q = q.filter(LegacyGyneCytoReport.hospital_id == hospital_id)
    total = q.count()
    items = q.order_by(LegacyGyneCytoReport.id.desc()).offset(skip).limit(limit).all()
    return {"items": [_to_dict(r) for r in items], "total": total}


@router.get("/gyne/{report_id}/pdf", dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)])
def get_legacy_gyne_pdf(report_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = db.query(LegacyGyneCytoReport).filter(LegacyGyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)
    data = _build_legacy_pdf_data(report, db)
    settings = db.query(SystemSetting).first()
    template = f"reports/{settings.gyne_report_template or 'gyne_cyto_report_template.html'}" if settings else "reports/gyne_cyto_report_template.html"
    from app.services import pdf_service
    blob = pdf_service.generate_pdf_blob(data, template_name=template, is_preview=False)
    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=legacy_gyne_{report.accession_no}.pdf"},
    )


@router.post("/gyne/{report_id}/mark-read", dependencies=[Depends(get_current_user)])
def mark_legacy_gyne_read(report_id: int, db: Session = Depends(get_db)):
    report = db.query(LegacyGyneCytoReport).filter(LegacyGyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    report.is_read = True
    report.read_at = local_now()
    db.commit()
    return {"ok": True}


@router.get("/gyne/{report_id}", dependencies=[Depends(CAN_READ_GYNE_CYTO_REPORT)])
def get_legacy_gyne(report_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = db.query(LegacyGyneCytoReport).filter(LegacyGyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)
    return _to_dict(report)


# ── Non-Gyne Cytology ─────────────────────────────────────────────────────────

@router.get("/nongyne", dependencies=[Depends(CAN_READ_NONGYNE_CYTO_REPORT)])
def list_legacy_nongyne(
    skip: int = 0,
    limit: int = 20,
    search: Optional[str] = Query(None),
    hospital_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(LegacyNongyneCytoReport)
    if search:
        q = q.filter(_search_filter(LegacyNongyneCytoReport, search))
    if hospital_id is not None:
        q = q.filter(LegacyNongyneCytoReport.hospital_id == hospital_id)
    total = q.count()
    items = q.order_by(LegacyNongyneCytoReport.id.desc()).offset(skip).limit(limit).all()
    return {"items": [_to_dict(r) for r in items], "total": total}


@router.get("/nongyne/{report_id}/pdf", dependencies=[Depends(CAN_READ_NONGYNE_CYTO_REPORT)])
def get_legacy_nongyne_pdf(report_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = db.query(LegacyNongyneCytoReport).filter(LegacyNongyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)
    data = _build_legacy_pdf_data(report, db)
    settings = db.query(SystemSetting).first()
    template = f"reports/{settings.nongyne_report_template or 'nongyne_cyto_report_template.html'}" if settings else "reports/nongyne_cyto_report_template.html"
    from app.services import pdf_service
    blob = pdf_service.generate_pdf_blob(data, template_name=template, is_preview=False)
    return StreamingResponse(
        io.BytesIO(blob),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=legacy_nongyne_{report.accession_no}.pdf"},
    )


@router.post("/nongyne/{report_id}/mark-read", dependencies=[Depends(get_current_user)])
def mark_legacy_nongyne_read(report_id: int, db: Session = Depends(get_db)):
    report = db.query(LegacyNongyneCytoReport).filter(LegacyNongyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    report.is_read = True
    report.read_at = local_now()
    db.commit()
    return {"ok": True}


@router.get("/nongyne/{report_id}", dependencies=[Depends(CAN_READ_NONGYNE_CYTO_REPORT)])
def get_legacy_nongyne(report_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = db.query(LegacyNongyneCytoReport).filter(LegacyNongyneCytoReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Not found")
    assert_hospital_scoped_access(current_user, report.hospital_id)
    return _to_dict(report)
