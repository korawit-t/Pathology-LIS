from sqlalchemy.orm import Session
from app.models.ihc_marker_option import IHCMarkerOption
from app.models.ihc_result import IHCResult
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.schemas.ihc import IHCMarkerOptionCreate, IHCMarkerOptionUpdate, IHCResultUpsert
from typing import List


def _sync_stain_status(db: Session, specimen_id: int, ap_test_id: int, has_result: bool) -> None:
    """Auto-mark stains as completed when a result is recorded, revert to stained when cleared."""
    target_status = "completed" if has_result else "stained"
    stains = (
        db.query(SurgicalBlockStain)
        .join(SurgicalBlock, SurgicalBlock.id == SurgicalBlockStain.block_id)
        .filter(
            SurgicalBlock.specimen_id == specimen_id,
            SurgicalBlockStain.test_id == ap_test_id,
            SurgicalBlockStain.status.in_(["stained", "completed"]),
        )
        .all()
    )
    for stain in stains:
        stain.status = target_status


# ── Options (admin) ───────────────────────────────────────────────────────────

def get_options_by_marker(db: Session, ap_test_id: int) -> List[IHCMarkerOption]:
    return (
        db.query(IHCMarkerOption)
        .filter(IHCMarkerOption.ap_test_id == ap_test_id)
        .order_by(IHCMarkerOption.display_order)
        .all()
    )

def create_option(db: Session, obj_in: IHCMarkerOptionCreate) -> IHCMarkerOption:
    obj = IHCMarkerOption(**obj_in.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

def update_option(db: Session, option_id: int, obj_in: IHCMarkerOptionUpdate) -> IHCMarkerOption | None:
    obj = db.query(IHCMarkerOption).filter(IHCMarkerOption.id == option_id).first()
    if not obj:
        return None
    for k, v in obj_in.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj

def delete_option(db: Session, option_id: int) -> bool:
    obj = db.query(IHCMarkerOption).filter(IHCMarkerOption.id == option_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# ── Results (pathologist) ─────────────────────────────────────────────────────

def upsert_result(db: Session, obj_in: IHCResultUpsert) -> IHCResult:
    existing = db.query(IHCResult).filter(
        IHCResult.surgical_specimen_id == obj_in.surgical_specimen_id,
        IHCResult.ap_test_id == obj_in.ap_test_id,
    ).first()
    if existing:
        existing.selected_option = obj_in.selected_option
        existing.numeric_value = obj_in.numeric_value
        existing.note = obj_in.note
    else:
        existing = IHCResult(**obj_in.model_dump())
        db.add(existing)

    _sync_stain_status(
        db, obj_in.surgical_specimen_id, obj_in.ap_test_id,
        has_result=bool(obj_in.selected_option)
    )
    db.commit()
    db.refresh(existing)
    return existing

def delete_result(db: Session, result_id: int) -> bool:
    obj = db.query(IHCResult).filter(IHCResult.id == result_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# ── Composite: markers + options + results for a specimen ─────────────────────

def get_ihc_panel_for_specimen(db: Session, specimen_id: int) -> list:
    """Return all IHC markers stained for this specimen, with their options and saved result."""
    markers = (
        db.query(AnatomicalPathologyTest)
        .join(SurgicalBlockStain, SurgicalBlockStain.test_id == AnatomicalPathologyTest.id)
        .join(SurgicalBlock, SurgicalBlock.id == SurgicalBlockStain.block_id)
        .filter(
            SurgicalBlock.specimen_id == specimen_id,
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
        options = get_options_by_marker(db, marker.id)
        result = db.query(IHCResult).filter(
            IHCResult.surgical_specimen_id == specimen_id,
            IHCResult.ap_test_id == marker.id,
        ).first()
        panel.append({
            "ap_test_id": marker.id,
            "marker_name": marker.name,
            "options": options,
            "result": result,
        })
    return panel


# ── Text generation ───────────────────────────────────────────────────────────

def generate_ihc_text(panel: list) -> str:
    """Convert IHC panel results to a plain-text string for insertion into report."""
    if not panel:
        return ""

    lines = []
    for item in panel:
        result = item.get("result")
        if not result:
            continue
        marker = item["marker_name"]
        parts = []
        if result.selected_option:
            # Convert option_value back to label if available
            label = result.selected_option
            for opt in item.get("options", []):
                if opt.option_value == result.selected_option:
                    label = opt.option_label
                    break
            parts.append(label)
        if result.numeric_value is not None:
            # Find numeric unit from the matching option
            unit = ""
            for opt in item.get("options", []):
                if opt.numeric_unit:
                    unit = opt.numeric_unit
                    break
            parts.append(f"{result.numeric_value:g}{unit}")
        if result.note:
            parts.append(f"({result.note})")
        if parts:
            lines.append(f"{marker}: {', '.join(parts)}")

    if not lines:
        return ""
    return "Immunohistochemical staining reveals:\n" + "\n".join(f"- {l}" for l in lines)
