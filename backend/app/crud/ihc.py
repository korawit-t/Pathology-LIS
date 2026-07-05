from sqlalchemy.orm import Session
from app.models.ihc_marker_option import IHCMarkerOption
from app.models.ihc_result import IHCResult
from app.models.ihc_marker_extra_field import IHCMarkerExtraField
from app.models.ihc_marker_extra_field_option import IHCMarkerExtraFieldOption
from app.models.ihc_result_extra_value import IHCResultExtraValue
from app.models.surgical_block import SurgicalBlock
from app.models.surgical_block_stain import SurgicalBlockStain
from app.models.anatomical_pathology_test import AnatomicalPathologyTest
from app.schemas.ihc import (
    IHCMarkerOptionCreate,
    IHCMarkerOptionUpdate,
    IHCResultUpsert,
    IHCMarkerExtraFieldCreate,
    IHCMarkerExtraFieldUpdate,
    IHCMarkerExtraFieldOptionCreate,
    IHCMarkerExtraFieldOptionUpdate,
    IHCResultExtraValueUpsert,
)
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

def _get_or_create_result(db: Session, surgical_specimen_id: int, ap_test_id: int) -> IHCResult:
    """Shared by upsert_result and upsert_extra_value: an extra field can be filled
    in before the primary pick exists, so both paths need the same parent row."""
    result = db.query(IHCResult).filter(
        IHCResult.surgical_specimen_id == surgical_specimen_id,
        IHCResult.ap_test_id == ap_test_id,
    ).first()
    if not result:
        result = IHCResult(surgical_specimen_id=surgical_specimen_id, ap_test_id=ap_test_id)
        db.add(result)
        db.flush()
    return result

def upsert_result(db: Session, obj_in: IHCResultUpsert) -> IHCResult:
    existing = _get_or_create_result(db, obj_in.surgical_specimen_id, obj_in.ap_test_id)
    existing.selected_option = obj_in.selected_option
    existing.numeric_value = obj_in.numeric_value
    existing.note = obj_in.note

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


# ── Extra fields (admin) ───────────────────────────────────────────────────────

def get_extra_fields_by_marker(db: Session, ap_test_id: int) -> List[IHCMarkerExtraField]:
    return (
        db.query(IHCMarkerExtraField)
        .filter(IHCMarkerExtraField.ap_test_id == ap_test_id)
        .order_by(IHCMarkerExtraField.display_order)
        .all()
    )

def create_extra_field(db: Session, obj_in: IHCMarkerExtraFieldCreate) -> IHCMarkerExtraField:
    obj = IHCMarkerExtraField(**obj_in.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

def update_extra_field(db: Session, field_id: int, obj_in: IHCMarkerExtraFieldUpdate) -> IHCMarkerExtraField | None:
    obj = db.query(IHCMarkerExtraField).filter(IHCMarkerExtraField.id == field_id).first()
    if not obj:
        return None
    for k, v in obj_in.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj

def delete_extra_field(db: Session, field_id: int) -> bool:
    obj = db.query(IHCMarkerExtraField).filter(IHCMarkerExtraField.id == field_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True

def create_extra_field_option(db: Session, field_id: int, obj_in: IHCMarkerExtraFieldOptionCreate) -> IHCMarkerExtraFieldOption:
    obj = IHCMarkerExtraFieldOption(field_id=field_id, **obj_in.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

def update_extra_field_option(db: Session, option_id: int, obj_in: IHCMarkerExtraFieldOptionUpdate) -> IHCMarkerExtraFieldOption | None:
    obj = db.query(IHCMarkerExtraFieldOption).filter(IHCMarkerExtraFieldOption.id == option_id).first()
    if not obj:
        return None
    for k, v in obj_in.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj

def delete_extra_field_option(db: Session, option_id: int) -> bool:
    obj = db.query(IHCMarkerExtraFieldOption).filter(IHCMarkerExtraFieldOption.id == option_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# ── Extra field values (pathologist) ───────────────────────────────────────────

def upsert_extra_value(db: Session, obj_in: IHCResultExtraValueUpsert) -> IHCResultExtraValue | None:
    """Does NOT call _sync_stain_status — only the primary upsert_result path drives
    stain completion; extra fields are supplementary detail."""
    field = db.query(IHCMarkerExtraField).filter(IHCMarkerExtraField.id == obj_in.field_id).first()
    if not field:
        return None

    if not obj_in.value:
        result = db.query(IHCResult).filter(
            IHCResult.surgical_specimen_id == obj_in.surgical_specimen_id,
            IHCResult.ap_test_id == field.ap_test_id,
        ).first()
        if result:
            db.query(IHCResultExtraValue).filter(
                IHCResultExtraValue.ihc_result_id == result.id,
                IHCResultExtraValue.field_id == obj_in.field_id,
            ).delete()
            db.commit()
        return None

    result = _get_or_create_result(db, obj_in.surgical_specimen_id, field.ap_test_id)
    existing_value = db.query(IHCResultExtraValue).filter(
        IHCResultExtraValue.ihc_result_id == result.id,
        IHCResultExtraValue.field_id == obj_in.field_id,
    ).first()
    if existing_value:
        existing_value.value = obj_in.value
    else:
        existing_value = IHCResultExtraValue(ihc_result_id=result.id, field_id=obj_in.field_id, value=obj_in.value)
        db.add(existing_value)
    db.commit()
    db.refresh(existing_value)
    return existing_value


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

        extra_values_by_field = {}
        if result:
            extra_values_by_field = {
                v.field_id: v.value
                for v in db.query(IHCResultExtraValue)
                .filter(IHCResultExtraValue.ihc_result_id == result.id)
                .all()
            }
        extra_fields = [
            {
                "id": f.id,
                "ap_test_id": f.ap_test_id,
                "field_key": f.field_key,
                "label": f.label,
                "field_type": f.field_type,
                "numeric_unit": f.numeric_unit,
                "display_order": f.display_order,
                "options": [
                    {
                        "id": o.id,
                        "field_id": o.field_id,
                        "option_label": o.option_label,
                        "option_value": o.option_value,
                        "display_order": o.display_order,
                    }
                    for o in f.options
                ],
                "value": extra_values_by_field.get(f.id),
            }
            for f in get_extra_fields_by_marker(db, marker.id)
        ]

        panel.append({
            "ap_test_id": marker.id,
            "marker_name": marker.name,
            "options": options,
            "result": result,
            "extra_fields": extra_fields,
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
        for ef in sorted(item.get("extra_fields", []), key=lambda f: f["display_order"]):
            value = ef.get("value")
            if not value:
                continue
            if ef["field_type"] == "select":
                label = value
                for opt in ef.get("options", []):
                    if opt["option_value"] == value:
                        label = opt["option_label"]
                        break
                parts.append(label)
            elif ef["field_type"] == "numeric":
                parts.append(f"{value}{ef.get('numeric_unit') or ''}")
            else:
                parts.append(value)
        if result.note:
            parts.append(f"({result.note})")
        if parts:
            lines.append(f"{marker}: {', '.join(parts)}")

    if not lines:
        return ""
    return "Immunohistochemical staining reveals:\n" + "\n".join(f"- {l}" for l in lines)
