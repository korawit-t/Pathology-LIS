from sqlalchemy.orm import Session
from app.models.nongyne_ihc_result import NongyneIHCResult
from app.models.nongyne_cyto_stain import NongyneCytologyStain
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.models.ihc_marker_option import IHCMarkerOption
from app.schemas.ihc import NongyneIHCResultUpsert
from typing import List


def _sync_stain_status(db: Session, case_id: int, ap_test_id: int, has_result: bool) -> None:
    target_status = "completed" if has_result else "stained"
    stains = (
        db.query(NongyneCytologyStain)
        .filter(
            NongyneCytologyStain.case_id == case_id,
            NongyneCytologyStain.test_id == ap_test_id,
            NongyneCytologyStain.status.in_(["stained", "completed"]),
        )
        .all()
    )
    for stain in stains:
        stain.status = target_status


def get_ihc_panel_for_nongyne_case(db: Session, case_id: int) -> list:
    markers = (
        db.query(AnatomicalPathologyTest)
        .join(NongyneCytologyStain, NongyneCytologyStain.test_id == AnatomicalPathologyTest.id)
        .filter(
            NongyneCytologyStain.case_id == case_id,
            AnatomicalPathologyTest.category == "IHC",
        )
        .distinct()
        .all()
    )

    panel = []
    seen: set = set()
    for marker in markers:
        if marker.id in seen:
            continue
        seen.add(marker.id)
        options = (
            db.query(IHCMarkerOption)
            .filter(IHCMarkerOption.ap_test_id == marker.id)
            .order_by(IHCMarkerOption.display_order)
            .all()
        )
        result = db.query(NongyneIHCResult).filter(
            NongyneIHCResult.case_id == case_id,
            NongyneIHCResult.ap_test_id == marker.id,
        ).first()
        panel.append({
            "ap_test_id": marker.id,
            "marker_name": marker.name,
            "options": options,
            "result": result,
        })
    return panel


def upsert_nongyne_result(db: Session, obj_in: NongyneIHCResultUpsert) -> NongyneIHCResult:
    existing = db.query(NongyneIHCResult).filter(
        NongyneIHCResult.case_id == obj_in.case_id,
        NongyneIHCResult.ap_test_id == obj_in.ap_test_id,
    ).first()
    if existing:
        existing.selected_option = obj_in.selected_option
        existing.numeric_value = obj_in.numeric_value
        existing.note = obj_in.note
    else:
        existing = NongyneIHCResult(**obj_in.model_dump())
        db.add(existing)

    _sync_stain_status(
        db, obj_in.case_id, obj_in.ap_test_id,
        has_result=bool(obj_in.selected_option),
    )
    db.commit()
    db.refresh(existing)
    return existing


def delete_nongyne_result(db: Session, result_id: int) -> bool:
    obj = db.query(NongyneIHCResult).filter(NongyneIHCResult.id == result_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True
