from fastapi import UploadFile, HTTPException
import shutil
import os
import io
import uuid
from pathlib import Path
from typing import Literal

# Path ฐานสำหรับเก็บไฟล์ Static (ต้องตรงกับที่ Mount ใน main.py)
STORAGE_ROOT = Path("uploads")

# ---------------------------------------------------------------------------
# Upload validation constants
# ---------------------------------------------------------------------------
MAX_IMAGE_BYTES = 30 * 1024 * 1024   # 30 MB for images
MAX_PDF_BYTES   = 20 * 1024 * 1024   # 20 MB for PDF documents
MAX_MIXED_BYTES = 30 * 1024 * 1024   # 30 MB for mixed (image or PDF)

_FileKind = Literal["image", "pdf", "mixed"]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _detect_type(data: bytes, allowed: _FileKind) -> str:
    """
    Detect file type from magic bytes.  Raises HTTP 400 if the content does
    not match an allowed type so the error is consistent regardless of which
    router called us.

    Returns a normalised extension string: "jpg" | "png" | "webp" | "pdf"
    """
    is_jpeg = data[:3] == b"\xff\xd8\xff"
    is_png  = data[:8] == b"\x89PNG\r\n\x1a\n"
    is_webp = data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WEBP"
    is_tiff = data[:4] in (b"\x49\x49\x2a\x00", b"\x4d\x4d\x00\x2a")  # LE / BE
    is_pdf  = data[:4] == b"%PDF"

    if allowed in ("image", "mixed"):
        if is_jpeg: return "jpg"
        if is_png:  return "png"
        if is_webp: return "webp"
        if is_tiff: return "tif"
    if allowed in ("pdf", "mixed"):
        if is_pdf: return "pdf"

    raise HTTPException(
        status_code=400,
        detail=(
            "Invalid file type. Only JPEG, PNG, WebP, and TIFF images are accepted."
            if allowed == "image"
            else "Invalid file type. Only PDF documents are accepted."
            if allowed == "pdf"
            else "Invalid file type. Accepted formats: JPEG, PNG, WebP, TIFF, PDF."
        ),
    )


def _strip_exif(image_bytes: bytes, fmt: str) -> bytes:
    """
    Re-encode an image with Pillow to strip all EXIF / XMP / IPTC metadata
    and any hidden payloads.  Returns the sanitised bytes.
    """
    from PIL import Image

    buf = io.BytesIO(image_bytes)
    try:
        img = Image.open(buf)
        img.load()   # force full decode so corrupt files raise here
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Image is corrupted or unreadable: {exc}")

    out = io.BytesIO()
    pil_fmt = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP", "tif": "PNG"}[fmt]
    # TIFF → re-encode as PNG (strips all EXIF/XMP, keeps full quality)

    # JPEG requires RGB; PNG/WebP/TIFF can stay in their native mode
    if pil_fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    img.save(out, format=pil_fmt)
    return out.getvalue()


def validate_and_sanitize(
    file: UploadFile,
    allowed: _FileKind = "image",
) -> tuple[bytes, str]:
    """
    Read the entire upload into memory, validate size and magic bytes,
    strip EXIF for images, then return (sanitised_bytes, extension).

    Raises HTTP 400 / 413 on any violation so callers just need to write
    the returned bytes to disk.
    """
    max_size = MAX_PDF_BYTES if allowed == "pdf" else MAX_MIXED_BYTES if allowed == "mixed" else MAX_IMAGE_BYTES

    # Read all bytes (size cap enforced in-memory)
    raw = file.file.read()
    if len(raw) > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {max_size // (1024*1024)} MB.",
        )
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    ext = _detect_type(raw, allowed)

    # Strip EXIF / metadata for images — re-encode through Pillow.
    # TIFF is re-encoded as PNG (lossless, strips all metadata).
    if ext in ("jpg", "png", "webp", "tif"):
        raw = _strip_exif(raw, ext)
        if ext == "tif":
            ext = "png"   # saved extension changes after re-encoding

    return raw, ext


async def save_gross_image_local(specimen_id: int, file: UploadFile) -> str:
    """Validate, sanitise (EXIF strip), and save a gross pathology image."""
    data, ext = validate_and_sanitize(file, allowed="image")

    dest_dir = STORAGE_ROOT / "gross_images" / str(specimen_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    unique_filename = f"{uuid.uuid4()}.{ext}"
    (dest_dir / unique_filename).write_bytes(data)
    return f"/storage/gross_images/{specimen_id}/{unique_filename}"


async def save_nongyne_image_local(case_id: int, file: UploadFile) -> str:
    """Validate, sanitise (EXIF strip), and save a non-gyne cytology image."""
    data, ext = validate_and_sanitize(file, allowed="image")

    dest_dir = STORAGE_ROOT / "nongyne_images" / str(case_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    unique_filename = f"{uuid.uuid4()}.{ext}"
    (dest_dir / unique_filename).write_bytes(data)
    return f"/storage/nongyne_images/{case_id}/{unique_filename}"


def delete_nongyne_image_local(image_url: str):
    import re
    if not re.fullmatch(r"/storage/nongyne_images/\d+/[\w\-]+\.\w+", image_url):
        raise ValueError(f"Invalid image_url format: {image_url}")
    relative = image_url.removeprefix("/storage/")
    file_path = (STORAGE_ROOT / relative).resolve()
    storage_root_resolved = STORAGE_ROOT.resolve()
    if not file_path.is_relative_to(storage_root_resolved):
        raise ValueError("Path traversal attempt detected")
    if file_path.exists():
        os.remove(file_path)
        return True
    return False


async def save_gyne_image_local(case_id: int, file: UploadFile) -> str:
    """Validate, sanitise (EXIF strip), and save a gyne cytology image."""
    data, ext = validate_and_sanitize(file, allowed="image")

    dest_dir = STORAGE_ROOT / "gyne_images" / str(case_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    unique_filename = f"{uuid.uuid4()}.{ext}"
    (dest_dir / unique_filename).write_bytes(data)
    return f"/storage/gyne_images/{case_id}/{unique_filename}"


def delete_gyne_image_local(image_url: str):
    import re
    if not re.fullmatch(r"/storage/gyne_images/\d+/[\w\-]+\.\w+", image_url):
        raise ValueError(f"Invalid image_url format: {image_url}")
    relative = image_url.removeprefix("/storage/")
    file_path = (STORAGE_ROOT / relative).resolve()
    storage_root_resolved = STORAGE_ROOT.resolve()
    if not file_path.is_relative_to(storage_root_resolved):
        raise ValueError("Path traversal attempt detected")
    if file_path.exists():
        os.remove(file_path)
        return True
    return False


def delete_gross_image_local(image_url: str):
    """
    Delete a Gross image from local storage using its URL path.
    Only files inside STORAGE_ROOT are allowed to be deleted.
    """
    import re
    # Only accept paths matching the expected pattern to prevent traversal
    if not re.fullmatch(r"/storage/gross_images/\d+/[\w\-]+\.\w+", image_url):
        raise ValueError(f"Invalid image_url format: {image_url}")

    # Strip the leading /storage prefix and resolve against STORAGE_ROOT
    relative = image_url.removeprefix("/storage/")
    file_path = (STORAGE_ROOT / relative).resolve()

    # Ensure the resolved path stays inside STORAGE_ROOT
    storage_root_resolved = STORAGE_ROOT.resolve()
    if not file_path.is_relative_to(storage_root_resolved):
        raise ValueError("Path traversal attempt detected")

    if file_path.exists():
        os.remove(file_path)
        return True
    return False
