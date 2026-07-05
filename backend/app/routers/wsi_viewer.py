import datetime
import os
import pathlib
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.roles import CAN_VIEW_WSI
from app.schemas.wsi_file import WsiFileResponse, WsiScanResult

router = APIRouter(prefix="/wsi", tags=["WSI Viewer"])

_DZI_TILE_SIZE = 254
_DZI_OVERLAP = 1


def _open_slide(db: Session, file_path: str):
    from app.crud.wsi_setting import get_wsi_settings

    settings = get_wsi_settings(db)
    root = settings.wsi_root_path
    if not root or not os.path.isdir(root):
        raise HTTPException(400, "WSI root path not configured in System Settings")

    # 🔒 path-traversal protection: requested file must resolve to somewhere
    # inside the configured WSI root, mirroring app/routers/storage.py.
    root_dir = pathlib.Path(root).resolve()
    requested = pathlib.Path(file_path).resolve()
    try:
        requested.relative_to(root_dir)
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden")

    if not requested.exists():
        raise HTTPException(404, f"File not found: {file_path}")

    try:
        import openslide
    except ImportError:
        raise HTTPException(500, "openslide-python not installed")
    try:
        return openslide.open_slide(str(requested))
    except Exception as e:
        raise HTTPException(400, f"Cannot open slide: {e}")


@router.get("/info", dependencies=[Depends(CAN_VIEW_WSI)])
def get_wsi_info(path: str = Query(...), db: Session = Depends(get_db)):
    slide = _open_slide(db, path)
    import openslide
    return {
        "format": slide.properties.get("openslide.vendor", "unknown"),
        "dimensions": slide.dimensions,
        "level_count": slide.level_count,
        "level_dimensions": slide.level_dimensions,
        "level_downsamples": list(slide.level_downsamples),
        "mpp_x": slide.properties.get(openslide.PROPERTY_NAME_MPP_X),
        "mpp_y": slide.properties.get(openslide.PROPERTY_NAME_MPP_Y),
    }


@router.get("/thumbnail", dependencies=[Depends(CAN_VIEW_WSI)])
def get_thumbnail(path: str = Query(...), size: int = Query(512, ge=64, le=2048), db: Session = Depends(get_db)):
    slide = _open_slide(db, path)
    thumb = slide.get_thumbnail((size, size))
    buf = io.BytesIO()
    thumb.convert("RGB").save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg")


@router.get("/dzi-info", dependencies=[Depends(CAN_VIEW_WSI)])
def get_dzi_info(path: str = Query(...), db: Session = Depends(get_db)):
    from openslide.deepzoom import DeepZoomGenerator
    slide = _open_slide(db, path)
    dz = DeepZoomGenerator(slide, tile_size=_DZI_TILE_SIZE, overlap=_DZI_OVERLAP)
    w, h = dz.level_dimensions[-1]
    return {
        "tile_size": _DZI_TILE_SIZE,
        "overlap": _DZI_OVERLAP,
        "level_count": dz.level_count,
        "width": w,
        "height": h,
    }


@router.get("/list", dependencies=[Depends(CAN_VIEW_WSI)])
def list_wsi_files(db: Session = Depends(get_db)):
    from app.crud.wsi_setting import get_wsi_settings

    settings = get_wsi_settings(db)
    root = settings.wsi_root_path
    if not root or not os.path.isdir(root):
        return []

    results = []
    for entry in pathlib.Path(root).glob("*"):
        if entry.is_file():
            stat = entry.stat()
            results.append({
                "filename": entry.name,
                "path": str(entry),
                "size_mb": round(stat.st_size / (1024 ** 2), 2),
                "modified_at": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "extension": entry.suffix.lstrip(".").lower(),
            })
    results.sort(key=lambda x: x["modified_at"], reverse=True)
    return results


@router.post("/scan", response_model=WsiScanResult, dependencies=[Depends(CAN_VIEW_WSI)])
def trigger_scan(db: Session = Depends(get_db)):
    from app.crud.wsi_setting import get_wsi_settings
    from app.crud.wsi_file import run_scan_and_match

    settings = get_wsi_settings(db)
    if not settings.wsi_root_path:
        raise HTTPException(400, "WSI root path not configured in System Settings")
    return run_scan_and_match(db, settings)


@router.get("/files", response_model=List[WsiFileResponse], dependencies=[Depends(CAN_VIEW_WSI)])
def list_wsi_files_from_db(
    skip: int = 0,
    limit: int = 200,
    unlinked_only: bool = False,
    parse_confidence: str = None,
    db: Session = Depends(get_db),
):
    from app.crud.wsi_file import get_wsi_files
    return get_wsi_files(db, skip=skip, limit=limit,
                         unlinked_only=unlinked_only,
                         parse_confidence=parse_confidence)


@router.get("/block/{block_id}/slides", response_model=List[WsiFileResponse],
            dependencies=[Depends(CAN_VIEW_WSI)])
def get_block_slides(block_id: int, db: Session = Depends(get_db)):
    from app.crud.wsi_file import get_block_confirmed_slides
    return get_block_confirmed_slides(db, block_id)


@router.get("/case/{case_id}/slides", response_model=List[WsiFileResponse],
            dependencies=[Depends(CAN_VIEW_WSI)])
def get_case_slides(case_id: int, db: Session = Depends(get_db)):
    from app.crud.wsi_file import get_case_confirmed_slides
    return get_case_confirmed_slides(db, case_id)


@router.get("/dzi-tile/{level}/{col}/{row}", dependencies=[Depends(CAN_VIEW_WSI)])
def get_dzi_tile(level: int, col: int, row: int, path: str = Query(...), db: Session = Depends(get_db)):
    from openslide.deepzoom import DeepZoomGenerator
    slide = _open_slide(db, path)
    dz = DeepZoomGenerator(slide, tile_size=_DZI_TILE_SIZE, overlap=_DZI_OVERLAP)
    if level < 0 or level >= dz.level_count:
        raise HTTPException(400, f"Level {level} out of range (0–{dz.level_count - 1})")
    try:
        tile = dz.get_tile(level, (col, row))
    except Exception as e:
        raise HTTPException(400, f"Cannot read tile: {e}")
    buf = io.BytesIO()
    tile.convert("RGB").save(buf, format="JPEG", quality=80)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg")
