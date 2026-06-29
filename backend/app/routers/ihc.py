from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date as date_type

from app.db.database import get_db
from app.dependencies.auth import check_password_status, get_current_user
from app.core.roles import CAN_WRITE_REPORT, CAN_MANAGE_SETTINGS
from app.models.user import User
from app.schemas.ihc import (
    IHCMarkerOptionCreate,
    IHCMarkerOptionUpdate,
    IHCMarkerOptionResponse,
    IHCResultUpsert,
    IHCResultResponse,
    IHCMarkerWithResult,
    NongyneIHCResultUpsert,
    NongyneIHCResultResponse,
    NongyneIHCMarkerWithResult,
)
import app.crud.ihc as ihc_crud
import app.crud.nongyne_ihc as nongyne_ihc_crud

router = APIRouter(
    prefix="/ihc",
    tags=["IHC"],
    dependencies=[Depends(check_password_status)],
)


# ── Admin: marker options ─────────────────────────────────────────────────────

@router.get("/markers/{ap_test_id}/options", response_model=List[IHCMarkerOptionResponse], dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def list_options(ap_test_id: int, db: Session = Depends(get_db)):
    return ihc_crud.get_options_by_marker(db, ap_test_id)


@router.post("/markers/{ap_test_id}/options", response_model=IHCMarkerOptionResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def create_option(ap_test_id: int, payload: IHCMarkerOptionCreate, db: Session = Depends(get_db)):
    if payload.ap_test_id != ap_test_id:
        raise HTTPException(status_code=400, detail="ap_test_id mismatch")
    return ihc_crud.create_option(db, payload)


@router.patch("/options/{option_id}", response_model=IHCMarkerOptionResponse, dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def update_option(option_id: int, payload: IHCMarkerOptionUpdate, db: Session = Depends(get_db)):
    obj = ihc_crud.update_option(db, option_id, payload)
    if not obj:
        raise HTTPException(status_code=404, detail="Option not found")
    return obj


@router.delete("/options/{option_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(CAN_MANAGE_SETTINGS)])
def delete_option(option_id: int, db: Session = Depends(get_db)):
    if not ihc_crud.delete_option(db, option_id):
        raise HTTPException(status_code=404, detail="Option not found")
    return None


# ── Pathologist: results ──────────────────────────────────────────────────────

@router.get("/specimens/{specimen_id}/panel", response_model=List[IHCMarkerWithResult], dependencies=[Depends(CAN_WRITE_REPORT)])
def get_panel(specimen_id: int, db: Session = Depends(get_db)):
    return ihc_crud.get_ihc_panel_for_specimen(db, specimen_id)


@router.put("/results", response_model=IHCResultResponse, dependencies=[Depends(CAN_WRITE_REPORT)])
def upsert_result(payload: IHCResultUpsert, db: Session = Depends(get_db)):
    return ihc_crud.upsert_result(db, payload)


@router.delete("/results/{result_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(CAN_WRITE_REPORT)])
def delete_result(result_id: int, db: Session = Depends(get_db)):
    if not ihc_crud.delete_result(db, result_id):
        raise HTTPException(status_code=404, detail="Result not found")
    return None


# ── Non-Gyne IHC (case-level) ─────────────────────────────────────────────────

@router.get("/nongyne-cases/{case_id}/panel", response_model=List[NongyneIHCMarkerWithResult], dependencies=[Depends(CAN_WRITE_REPORT)])
def get_nongyne_panel(case_id: int, db: Session = Depends(get_db)):
    return nongyne_ihc_crud.get_ihc_panel_for_nongyne_case(db, case_id)


@router.put("/nongyne-results", response_model=NongyneIHCResultResponse, dependencies=[Depends(CAN_WRITE_REPORT)])
def upsert_nongyne_result(payload: NongyneIHCResultUpsert, db: Session = Depends(get_db)):
    return nongyne_ihc_crud.upsert_nongyne_result(db, payload)


@router.delete("/nongyne-results/{result_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(CAN_WRITE_REPORT)])
def delete_nongyne_result(result_id: int, db: Session = Depends(get_db)):
    if not nongyne_ihc_crud.delete_nongyne_result(db, result_id):
        raise HTTPException(status_code=404, detail="Result not found")
    return None


# ── Stats ────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_ihc_stats(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Aggregate IHC result counts per marker per option value.
    Returns surgical and non-gyne cytology stats for the given registration date range.
    """
    from app.models.ihc_result import IHCResult
    from app.models.nongyne_ihc_result import NongyneIHCResult
    from app.models.ihc_marker_option import IHCMarkerOption
    from app.models.anatomical_pathology_test import AnatomicalPathologyTest
    from app.models.surgical_specimen import SurgicalSpecimen
    from app.models.surgical_case import SurgicalCase
    from app.models.nongyne_cyto_case import NongyneCytologyCase

    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)

    def _build_marker_rows(rows, db):
        markers: dict = {}
        for marker_name, ap_test_id, selected_option, count in rows:
            if ap_test_id not in markers:
                options = (
                    db.query(IHCMarkerOption)
                    .filter(IHCMarkerOption.ap_test_id == ap_test_id)
                    .order_by(IHCMarkerOption.display_order)
                    .all()
                )
                option_label_map = {o.option_value: o.option_label for o in options}
                markers[ap_test_id] = {
                    "ap_test_id": ap_test_id,
                    "marker_name": marker_name,
                    "total": 0,
                    "results": [],
                    "_option_label_map": option_label_map,
                }
            entry = markers[ap_test_id]
            label = entry["_option_label_map"].get(selected_option, selected_option) if selected_option else "(ไม่ระบุ)"
            entry["results"].append({
                "option_value": selected_option or "",
                "option_label": label,
                "count": count,
            })
            entry["total"] += count

        result = []
        for m in sorted(markers.values(), key=lambda x: x["marker_name"]):
            m.pop("_option_label_map")
            result.append(m)
        return result

    # Surgical IHC
    surgical_rows = (
        db.query(
            AnatomicalPathologyTest.name,
            IHCResult.ap_test_id,
            IHCResult.selected_option,
            func.count(IHCResult.id),
        )
        .join(AnatomicalPathologyTest, AnatomicalPathologyTest.id == IHCResult.ap_test_id)
        .join(SurgicalSpecimen, SurgicalSpecimen.id == IHCResult.surgical_specimen_id)
        .join(SurgicalCase, SurgicalCase.id == SurgicalSpecimen.case_id)
        .filter(
            IHCResult.selected_option.isnot(None),
            func.date(SurgicalCase.registered_at) >= start,
            func.date(SurgicalCase.registered_at) <= end,
        )
        .group_by(AnatomicalPathologyTest.name, IHCResult.ap_test_id, IHCResult.selected_option)
        .all()
    )

    # Non-Gyne IHC
    nongyne_rows = (
        db.query(
            AnatomicalPathologyTest.name,
            NongyneIHCResult.ap_test_id,
            NongyneIHCResult.selected_option,
            func.count(NongyneIHCResult.id),
        )
        .join(AnatomicalPathologyTest, AnatomicalPathologyTest.id == NongyneIHCResult.ap_test_id)
        .join(NongyneCytologyCase, NongyneCytologyCase.id == NongyneIHCResult.case_id)
        .filter(
            NongyneIHCResult.selected_option.isnot(None),
            func.date(NongyneCytologyCase.registered_at) >= start,
            func.date(NongyneCytologyCase.registered_at) <= end,
        )
        .group_by(AnatomicalPathologyTest.name, NongyneIHCResult.ap_test_id, NongyneIHCResult.selected_option)
        .all()
    )

    return {
        "surgical": _build_marker_rows(surgical_rows, db),
        "nongyne": _build_marker_rows(nongyne_rows, db),
    }


@router.get("/case-list")
def get_ihc_case_list(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Case-level IHC table for study/research use.
    Returns rows with accession, specimen, diagnosis, and IHC results as pivot columns.
    """
    from app.models.ihc_result import IHCResult
    from app.models.nongyne_ihc_result import NongyneIHCResult
    from app.models.ihc_marker_option import IHCMarkerOption
    from app.models.anatomical_pathology_test import AnatomicalPathologyTest
    from app.models.surgical_specimen import SurgicalSpecimen
    from app.models.surgical_case import SurgicalCase
    from app.models.surgical_diagnosis import SurgicalDiagnosis
    from app.models.nongyne_cyto_case import NongyneCytologyCase
    from app.models.nongyne_diagnosis import NongyneDiagnosis

    start = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(end_date)

    def _label_for(option_value: Optional[str], ap_test_id: int, option_map: dict) -> str:
        if not option_value:
            return ""
        return option_map.get((ap_test_id, option_value), option_value)

    def _build_option_map(db, ap_test_ids: list) -> dict:
        if not ap_test_ids:
            return {}
        rows = (
            db.query(IHCMarkerOption.ap_test_id, IHCMarkerOption.option_value, IHCMarkerOption.option_label)
            .filter(IHCMarkerOption.ap_test_id.in_(ap_test_ids))
            .all()
        )
        return {(r.ap_test_id, r.option_value): r.option_label for r in rows}

    # ── Surgical ─────────────────────────────────────────────────────────────
    surg_results = (
        db.query(
            SurgicalCase.accession_no,
            SurgicalCase.registered_at,
            SurgicalSpecimen.id.label("specimen_id"),
            SurgicalSpecimen.specimen_label,
            SurgicalSpecimen.specimen_name,
            AnatomicalPathologyTest.id.label("ap_test_id"),
            AnatomicalPathologyTest.name.label("marker_name"),
            IHCResult.selected_option,
            IHCResult.numeric_value,
        )
        .join(SurgicalSpecimen, SurgicalSpecimen.case_id == SurgicalCase.id)
        .join(IHCResult, IHCResult.surgical_specimen_id == SurgicalSpecimen.id)
        .join(AnatomicalPathologyTest, AnatomicalPathologyTest.id == IHCResult.ap_test_id)
        .filter(
            IHCResult.selected_option.isnot(None),
            func.date(SurgicalCase.registered_at) >= start,
            func.date(SurgicalCase.registered_at) <= end,
        )
        .order_by(SurgicalCase.registered_at, SurgicalCase.accession_no, SurgicalSpecimen.specimen_label)
        .all()
    )

    surg_ap_ids = list({r.ap_test_id for r in surg_results})
    surg_option_map = _build_option_map(db, surg_ap_ids)

    # Collect latest signed diagnosis per specimen
    surg_diag_map: dict = {}
    if surg_results:
        specimen_ids = list({r.specimen_id for r in surg_results})
        diag_rows = (
            db.query(SurgicalDiagnosis.surgical_specimen_id, SurgicalDiagnosis.diagnosis)
            .filter(
                SurgicalDiagnosis.surgical_specimen_id.in_(specimen_ids),
                SurgicalDiagnosis.status == "signed",
            )
            .order_by(SurgicalDiagnosis.surgical_specimen_id, SurgicalDiagnosis.diagnosis_order)
            .all()
        )
        for row in diag_rows:
            if row.surgical_specimen_id not in surg_diag_map and row.diagnosis:
                surg_diag_map[row.surgical_specimen_id] = row.diagnosis

    # Pivot per specimen
    surg_specimen_map: dict = {}
    surg_columns_set: list = []
    surg_columns_seen: set = set()
    for r in surg_results:
        key = (r.accession_no, r.specimen_id)
        if key not in surg_specimen_map:
            surg_specimen_map[key] = {
                "accession_no": r.accession_no,
                "registered_at": r.registered_at.date().isoformat() if r.registered_at else None,
                "specimen_label": r.specimen_label,
                "specimen_name": r.specimen_name,
                "diagnosis": surg_diag_map.get(r.specimen_id, ""),
                "ihc": {},
            }
        label = _label_for(r.selected_option, r.ap_test_id, surg_option_map)
        if r.numeric_value is not None:
            label = f"{label} ({r.numeric_value:g})"
        surg_specimen_map[key]["ihc"][r.marker_name] = label
        if r.marker_name not in surg_columns_seen:
            surg_columns_seen.add(r.marker_name)
            surg_columns_set.append(r.marker_name)

    surg_columns_ordered = surg_columns_set

    # ── Non-Gyne ─────────────────────────────────────────────────────────────
    ng_results = (
        db.query(
            NongyneCytologyCase.accession_no,
            NongyneCytologyCase.registered_at,
            NongyneCytologyCase.id.label("case_id"),
            AnatomicalPathologyTest.id.label("ap_test_id"),
            AnatomicalPathologyTest.name.label("marker_name"),
            NongyneIHCResult.selected_option,
            NongyneIHCResult.numeric_value,
        )
        .join(NongyneIHCResult, NongyneIHCResult.case_id == NongyneCytologyCase.id)
        .join(AnatomicalPathologyTest, AnatomicalPathologyTest.id == NongyneIHCResult.ap_test_id)
        .filter(
            NongyneIHCResult.selected_option.isnot(None),
            func.date(NongyneCytologyCase.registered_at) >= start,
            func.date(NongyneCytologyCase.registered_at) <= end,
        )
        .order_by(NongyneCytologyCase.registered_at, NongyneCytologyCase.accession_no)
        .all()
    )

    ng_ap_ids = list({r.ap_test_id for r in ng_results})
    ng_option_map = _build_option_map(db, ng_ap_ids)

    ng_diag_map: dict = {}
    if ng_results:
        ng_case_ids = list({r.case_id for r in ng_results})
        ng_diag_rows = (
            db.query(NongyneDiagnosis.case_id, NongyneDiagnosis.diagnosis)
            .filter(
                NongyneDiagnosis.case_id.in_(ng_case_ids),
                NongyneDiagnosis.is_current == True,
                NongyneDiagnosis.status == "signed",
            )
            .all()
        )
        for row in ng_diag_rows:
            if row.case_id not in ng_diag_map and row.diagnosis:
                ng_diag_map[row.case_id] = row.diagnosis

    ng_case_map: dict = {}
    ng_columns_set: list = []
    ng_columns_seen: set = set()
    for r in ng_results:
        if r.case_id not in ng_case_map:
            ng_case_map[r.case_id] = {
                "accession_no": r.accession_no,
                "registered_at": r.registered_at.date().isoformat() if r.registered_at else None,
                "diagnosis": ng_diag_map.get(r.case_id, ""),
                "ihc": {},
            }
        label = _label_for(r.selected_option, r.ap_test_id, ng_option_map)
        if r.numeric_value is not None:
            label = f"{label} ({r.numeric_value:g})"
        ng_case_map[r.case_id]["ihc"][r.marker_name] = label
        if r.marker_name not in ng_columns_seen:
            ng_columns_seen.add(r.marker_name)
            ng_columns_set.append(r.marker_name)

    return {
        "surgical": {
            "columns": surg_columns_ordered,
            "rows": list(surg_specimen_map.values()),
        },
        "nongyne": {
            "columns": ng_columns_set,
            "rows": list(ng_case_map.values()),
        },
    }
