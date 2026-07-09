from sqlalchemy.orm import Session

from app.models.surgical_block import SurgicalBlock


def build_submitted_sections_text(label: str, is_entirely_submitted: bool, blocks: list) -> str:
    """Build the 'Representative sections are submitted: A1(3, desc), A2...' line."""
    if not blocks:
        return ""
    prefix = "Entirely submitted" if is_entirely_submitted else "Representative sections are submitted"
    parts = []
    for b in blocks:
        code = f"{label}{b['block_no']}"
        desc = (b.get("tissue_description") or "").strip()
        tc = b.get("tissue_count")
        if b.get("is_tissue_uncountable"):
            parts.append(f"{code}(multiple fragments{', ' + desc if desc else ''})")
        elif tc and desc:
            parts.append(f"{code}({tc}, {desc})")
        elif tc:
            parts.append(f"{code}({tc})")
        elif desc:
            parts.append(f"{code}({desc})")
        else:
            parts.append(code)
    return f"{prefix}: {', '.join(parts)}"


def fetch_blocks_by_specimen(db: Session, specimen_ids: list[int]) -> dict[int, list]:
    """Bulk-fetch SurgicalBlock rows for many specimens at once (avoids N+1 queries),
    grouped and shaped into the dict form build_submitted_sections_text expects."""
    if not specimen_ids:
        return {}
    blocks = (
        db.query(SurgicalBlock)
        .filter(SurgicalBlock.specimen_id.in_(specimen_ids))
        .order_by(SurgicalBlock.specimen_id, SurgicalBlock.block_no.asc())
        .all()
    )
    result: dict[int, list] = {sid: [] for sid in specimen_ids}
    for b in blocks:
        result.setdefault(b.specimen_id, []).append({
            "block_no": b.block_no,
            "tissue_count": b.tissue_count,
            "tissue_description": b.tissue_description or "",
            "is_tissue_uncountable": bool(b.is_tissue_uncountable),
        })
    return result
