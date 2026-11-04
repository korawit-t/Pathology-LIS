from fastapi import UploadFile, HTTPException
import io
import re
import uuid
from typing import Literal

from app.utils import storage_paths

# ---------------------------------------------------------------------------
# Upload validation constants
# ---------------------------------------------------------------------------
MAX_IMAGE_BYTES = 30 * 1024 * 1024   # 30 MB for images
MAX_PDF_BYTES   = 20 * 1024 * 1024   # 20 MB for PDF documents
MAX_MIXED_BYTES = 30 * 1024 * 1024   # 30 MB for mixed (image or PDF)

_FileKind = Literal["image", "pdf", "mixed"]

# Quality for re-encoding lossy images in _strip_exif. Matches the frontend's
# camera capture quality (0.92); Pillow's defaults (JPEG 75, WebP 80) silently
# double-compressed every diagnostic photo on upload.
LOSSY_REENCODE_QUALITY = 92


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
    # PNG holds at most 16 bits per channel. Pillow 12 clipped 32-bit "I"
    # images to fit; Pillow 13 raises instead, so clip explicitly.
    if pil_fmt == "PNG" and img.mode == "I":
        img = img.convert("I;16")

    save_kwargs = {"quality": LOSSY_REENCODE_QUALITY} if pil_fmt in ("JPEG", "WEBP") else {}
    img.save(out, format=pil_fmt, **save_kwargs)
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

    key = f"/storage/gross_images/{specimen_id}/{uuid.uuid4()}.{ext}"
    storage_paths.save(key, data)
    return key


async def save_nongyne_image_local(case_id: int, file: UploadFile) -> str:
    """Validate, sanitise (EXIF strip), and save a non-gyne cytology image."""
    data, ext = validate_and_sanitize(file, allowed="image")

    key = f"/storage/nongyne_images/{case_id}/{uuid.uuid4()}.{ext}"
    storage_paths.save(key, data)
    return key


def delete_nongyne_image_local(image_url: str):
    if not re.fullmatch(r"/storage/nongyne_images/\d+/[\w\-]+\.\w+", image_url):
        raise ValueError(f"Invalid image_url format: {image_url}")
    return storage_paths.delete(image_url)


async def save_gyne_image_local(case_id: int, file: UploadFile) -> str:
    """Validate, sanitise (EXIF strip), and save a gyne cytology image."""
    data, ext = validate_and_sanitize(file, allowed="image")

    key = f"/storage/gyne_images/{case_id}/{uuid.uuid4()}.{ext}"
    storage_paths.save(key, data)
    return key


def delete_gyne_image_local(image_url: str):
    if not re.fullmatch(r"/storage/gyne_images/\d+/[\w\-]+\.\w+", image_url):
        raise ValueError(f"Invalid image_url format: {image_url}")
    return storage_paths.delete(image_url)


def delete_gross_image_local(image_url: str):
    """
    Delete a Gross image from local storage using its URL path.
    Only files inside the upload root are allowed to be deleted: the pattern
    check here, and storage_paths.delete's containment check behind it.
    """
    # Only accept paths matching the expected pattern to prevent traversal
    if not re.fullmatch(r"/storage/gross_images/\d+/[\w\-]+\.\w+", image_url):
        raise ValueError(f"Invalid image_url format: {image_url}")
    return storage_paths.delete(image_url)


async def save_microscopic_image_local(file: UploadFile) -> str:
    """
    Validate, sanitise (EXIF strip), and save a microscopic image.

    The layout deliberately differs from the other three image domains: files
    are flat in <upload root>/microscopic_images/ (no per-specimen subdirectory) and
    the stored URL carries no "/storage/" prefix, because this domain is served
    by its own /microscopic-images/get-image/ endpoint instead of the shared
    storage router. Kept as-is so existing rows keep resolving.
    """
    data, ext = validate_and_sanitize(file, allowed="image")

    key = f"microscopic_images/{uuid.uuid4()}.{ext}"
    storage_paths.save(key, data)
    return key


def delete_microscopic_image_local(image_url: str):
    """
    Delete a microscopic image from local storage using its stored URL.
    Mirrors the whitelist + containment guards of the other delete helpers;
    the pattern has no "/storage/" prefix and no id segment to match the
    flat layout described in save_microscopic_image_local.
    """
    if not re.fullmatch(r"microscopic_images/[\w\-]+\.\w+", image_url):
        raise ValueError(f"Invalid image_url format: {image_url}")
    return storage_paths.delete(image_url)

