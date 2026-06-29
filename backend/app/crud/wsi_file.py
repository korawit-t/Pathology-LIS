import os
import pathlib
import re
from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.surgical_block import SurgicalBlock
from app.models.surgical_case import SurgicalCase
from app.models.surgical_specimen import SurgicalSpecimen
from app.models.wsi_file import WsiFile
from app.models.wsi_setting import WsiScannerProfile, WsiSetting
from app.models.wsi_slide_link import WsiSlideLink

_LINK_LOAD_OPTIONS = (
    selectinload(WsiFile.slide_links)
    .selectinload(WsiSlideLink.surgical_block)
    .selectinload(SurgicalBlock.specimen)
    .selectinload(SurgicalSpecimen.case)
)

WSI_EXTENSIONS = {"svs", "ndpi", "tiff", "tif", "scn", "mrxs", "vms", "vmu", "btf"}


def parse_filename(
    filename: str, profile: WsiScannerProfile
) -> Tuple[Optional[str], Optional[str], str]:
    """
    Returns (accession, block_code, confidence).
    confidence: 'high' | 'low' | 'failed'
    """
    stem = pathlib.Path(filename).stem
    pattern = profile.filename_pattern or ""
    separator = profile.separator or "_"

    if "{accession}" not in pattern or "{block}" not in pattern:
        return None, None, "failed"

    parts = stem.rsplit(separator, 1)
    if len(parts) != 2:
        return None, None, "failed"

    # Determine which part is accession and which is block based on pattern order
    acc_idx = pattern.index("{accession}")
    blk_idx = pattern.index("{block}")

    if acc_idx < blk_idx:
        accession, block_code = parts[0], parts[1]
    else:
        block_code, accession = parts[0], parts[1]

    accession = accession.strip()
    block_code = block_code.strip().upper()

    # Validate block_code format: letter(s) + digit(s), e.g. "A1", "B12"
    if not re.match(r"^[A-Z]+\d+$", block_code):
        return accession or None, None, "low"

    if not accession:
        return None, block_code, "low"

    return accession, block_code, "high"


def _open_slide_metadata(file_path: str) -> dict:
    """Try to open slide and extract metadata. Returns empty dict on failure."""
    try:
        import openslide
        slide = openslide.open_slide(file_path)
        props = slide.properties
        vendor = props.get("openslide.vendor", None)
        mpp_x = props.get("openslide.mpp-x", None)
        mpp_y = props.get("openslide.mpp-y", None)
        w, h = slide.dimensions
        slide.close()
        return {
            "format": vendor,
            "width_px": w,
            "height_px": h,
            "mpp_x": float(mpp_x) if mpp_x else None,
            "mpp_y": float(mpp_y) if mpp_y else None,
            "level_count": slide.level_count,
        }
    except Exception:
        return {}


def discover_and_upsert_files(
    db: Session, root_path: str, profile: Optional[WsiScannerProfile]
) -> Tuple[int, int]:
    """
    Scan root_path for WSI files, upsert into wsi_files table.
    Returns (discovered_new, updated_existing).
    """
    discovered = 0
    updated = 0
    now = datetime.utcnow()

    extensions = set()
    if profile and profile.file_extensions:
        extensions = {e.lower().lstrip(".") for e in profile.file_extensions}
    else:
        extensions = WSI_EXTENSIONS

    for entry in pathlib.Path(root_path).glob("*"):
        if not entry.is_file():
            continue
        ext = entry.suffix.lstrip(".").lower()
        if ext not in extensions:
            continue

        file_path_str = str(entry)
        stat = entry.stat()
        size = stat.st_size

        existing: Optional[WsiFile] = (
            db.query(WsiFile).filter(WsiFile.file_path == file_path_str).first()
        )

        accession, block_code, confidence = (None, None, "failed")
        if profile:
            accession, block_code, confidence = parse_filename(entry.name, profile)

        if existing:
            existing.last_seen_at = now
            existing.file_size_bytes = size
            existing.scanner_profile_id = profile.id if profile else None
            existing.parsed_accession = accession
            existing.parsed_block = block_code
            existing.parse_confidence = confidence
            updated += 1
        else:
            meta = _open_slide_metadata(file_path_str)
            wsi = WsiFile(
                file_path=file_path_str,
                filename=entry.name,
                file_size_bytes=size,
                scanner_profile_id=profile.id if profile else None,
                parsed_accession=accession,
                parsed_block=block_code,
                parse_confidence=confidence,
                discovered_at=now,
                last_seen_at=now,
                **meta,
            )
            db.add(wsi)
            discovered += 1

    db.commit()
    return discovered, updated


def auto_match_file(db: Session, wsi_file: WsiFile) -> bool:
    """
    Try to find a surgical block matching parsed_accession + parsed_block.
    Creates a pending WsiSlideLink if found. Returns True if matched.
    """
    if (
        not wsi_file.parsed_accession
        or not wsi_file.parsed_block
        or wsi_file.parse_confidence != "high"
    ):
        return False

    block_code = wsi_file.parsed_block.upper()
    specimen_label = re.match(r"^([A-Z]+)", block_code)
    block_no_match = re.search(r"(\d+)$", block_code)

    if not specimen_label or not block_no_match:
        return False

    spec_label = specimen_label.group(1)
    block_no = int(block_no_match.group(1))

    case = (
        db.query(SurgicalCase)
        .filter(SurgicalCase.accession_no == wsi_file.parsed_accession)
        .first()
    )
    if not case:
        return False

    specimen = (
        db.query(SurgicalSpecimen)
        .filter(
            SurgicalSpecimen.case_id == case.id,
            SurgicalSpecimen.specimen_label == spec_label,
        )
        .first()
    )
    if not specimen:
        return False

    block = (
        db.query(SurgicalBlock)
        .filter(
            SurgicalBlock.specimen_id == specimen.id,
            SurgicalBlock.block_no == block_no,
        )
        .first()
    )
    if not block:
        return False

    # Check if link already exists
    existing_link = (
        db.query(WsiSlideLink)
        .filter(
            WsiSlideLink.wsi_file_id == wsi_file.id,
            WsiSlideLink.surgical_block_id == block.id,
        )
        .first()
    )
    if existing_link:
        return True

    link = WsiSlideLink(
        wsi_file_id=wsi_file.id,
        surgical_block_id=block.id,
        link_method="auto_filename",
        link_confidence=1.0,
        status="pending",
    )
    db.add(link)
    db.commit()
    return True


def run_scan_and_match(db: Session, settings: WsiSetting) -> dict:
    """Orchestrate full scan: discover files + auto-match to blocks."""
    profile = settings.default_scanner_profile
    root = settings.wsi_root_path

    if not root or not os.path.isdir(root):
        return {"discovered": 0, "updated": 0, "auto_linked": 0, "pending_review": 0}

    discovered, updated = discover_and_upsert_files(db, root, profile)

    # Auto-match unlinked files with high confidence parse
    unlinked = (
        db.query(WsiFile)
        .filter(
            WsiFile.parse_confidence == "high",
            ~WsiFile.slide_links.any(),
        )
        .options(joinedload(WsiFile.slide_links))
        .all()
    )

    auto_linked = 0
    for wsi_file in unlinked:
        if auto_match_file(db, wsi_file):
            auto_linked += 1

    pending_review = (
        db.query(WsiSlideLink).filter(WsiSlideLink.status == "pending").count()
    )

    return {
        "discovered": discovered,
        "updated": updated,
        "auto_linked": auto_linked,
        "pending_review": pending_review,
    }


def get_wsi_files(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    unlinked_only: bool = False,
    parse_confidence: Optional[str] = None,
) -> List[WsiFile]:
    q = db.query(WsiFile).options(_LINK_LOAD_OPTIONS)
    if unlinked_only:
        q = q.filter(~WsiFile.slide_links.any())
    if parse_confidence:
        q = q.filter(WsiFile.parse_confidence == parse_confidence)
    return q.order_by(WsiFile.last_seen_at.desc()).offset(skip).limit(limit).all()


def get_block_confirmed_slides(db: Session, block_id: int) -> List[WsiFile]:
    """Return WsiFiles with confirmed links for a given block."""
    links = (
        db.query(WsiSlideLink)
        .filter(
            WsiSlideLink.surgical_block_id == block_id,
            WsiSlideLink.status == "confirmed",
        )
        .options(joinedload(WsiSlideLink.wsi_file).joinedload(WsiFile.slide_links))
        .all()
    )
    return [link.wsi_file for link in links]


def get_case_confirmed_slides(db: Session, case_id: int) -> List[WsiFile]:
    """Return WsiFiles with confirmed links for any block in the given case."""
    links = (
        db.query(WsiSlideLink)
        .join(WsiSlideLink.surgical_block)
        .join(SurgicalBlock.specimen)
        .filter(
            WsiSlideLink.status == "confirmed",
            SurgicalSpecimen.case_id == case_id,
        )
        .options(joinedload(WsiSlideLink.wsi_file).joinedload(WsiFile.slide_links))
        .all()
    )
    # Deduplicate by wsi_file_id
    seen = set()
    result = []
    for link in links:
        if link.wsi_file_id not in seen:
            seen.add(link.wsi_file_id)
            result.append(link.wsi_file)
    return result
