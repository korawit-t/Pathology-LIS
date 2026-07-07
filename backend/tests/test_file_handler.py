"""Tests for app/utils/file_handler.py — upload validation/sanitisation.
This is the file CLAUDE.md calls out as having already-fixed magic-byte and
EXIF-stripping security checks (SECURITY_AUDIT.md is stale on this point);
these tests lock in that current, correct behavior.

save_*_image_local write to STORAGE_ROOT, which defaults to the real
`uploads/` directory relative to cwd — every test here monkeypatches
STORAGE_ROOT to a pytest tmp_path so nothing ever touches the app's actual
upload storage."""

import io

import pytest
from fastapi import HTTPException
from PIL import Image

import app.utils.file_handler as file_handler
from app.utils.file_handler import (
    _detect_type,
    _strip_exif,
    validate_and_sanitize,
    save_gross_image_local,
    save_nongyne_image_local,
    save_gyne_image_local,
    delete_gross_image_local,
    delete_nongyne_image_local,
    delete_gyne_image_local,
)


class FakeUploadFile:
    """validate_and_sanitize only ever calls file.file.read() — a full
    FastAPI UploadFile isn't needed."""
    def __init__(self, data: bytes):
        self.file = io.BytesIO(data)


def _image_bytes(fmt: str, with_exif: bool = False) -> bytes:
    img = Image.new("RGB", (16, 16), color="red")
    buf = io.BytesIO()
    if with_exif:
        exif = img.getexif()
        exif[0x0110] = "Test Camera Model"
        img.save(buf, format=fmt, exif=exif.tobytes())
    else:
        img.save(buf, format=fmt)
    return buf.getvalue()


PDF_BYTES = b"%PDF-1.4\n%fake minimal pdf for magic-byte testing\n%%EOF"


class TestDetectType:
    def test_recognises_jpeg_png_webp_tiff_for_image(self):
        assert _detect_type(_image_bytes("JPEG"), "image") == "jpg"
        assert _detect_type(_image_bytes("PNG"), "image") == "png"
        assert _detect_type(_image_bytes("WEBP"), "image") == "webp"
        assert _detect_type(_image_bytes("TIFF"), "image") == "tif"

    def test_recognises_pdf_for_pdf(self):
        assert _detect_type(PDF_BYTES, "pdf") == "pdf"

    def test_mixed_accepts_both_images_and_pdfs(self):
        assert _detect_type(_image_bytes("PNG"), "mixed") == "png"
        assert _detect_type(PDF_BYTES, "mixed") == "pdf"

    def test_pdf_bytes_rejected_when_only_images_are_allowed(self):
        with pytest.raises(HTTPException) as exc_info:
            _detect_type(PDF_BYTES, "image")
        assert exc_info.value.status_code == 400

    def test_image_bytes_rejected_when_only_pdf_is_allowed(self):
        with pytest.raises(HTTPException) as exc_info:
            _detect_type(_image_bytes("PNG"), "pdf")
        assert exc_info.value.status_code == 400

    def test_garbage_bytes_rejected(self):
        with pytest.raises(HTTPException) as exc_info:
            _detect_type(b"not a real file at all", "mixed")
        assert exc_info.value.status_code == 400


class TestStripExif:
    def test_strips_exif_metadata_from_a_jpeg(self):
        original = _image_bytes("JPEG", with_exif=True)
        assert dict(Image.open(io.BytesIO(original)).getexif())  # sanity: exif really was embedded

        cleaned = _strip_exif(original, "jpg")

        assert dict(Image.open(io.BytesIO(cleaned)).getexif()) == {}

    def test_tiff_is_re_encoded_as_png(self):
        original = _image_bytes("TIFF")

        cleaned = _strip_exif(original, "tif")

        assert cleaned[:8] == b"\x89PNG\r\n\x1a\n"

    def test_corrupted_image_raises_400(self):
        with pytest.raises(HTTPException) as exc_info:
            _strip_exif(b"garbage, not an image", "jpg")
        assert exc_info.value.status_code == 400


class TestValidateAndSanitize:
    def test_oversized_file_raises_413(self):
        huge = b"\xff\xd8\xff" + b"0" * (31 * 1024 * 1024)
        with pytest.raises(HTTPException) as exc_info:
            validate_and_sanitize(FakeUploadFile(huge), allowed="image")
        assert exc_info.value.status_code == 413

    def test_empty_file_raises_400(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_and_sanitize(FakeUploadFile(b""), allowed="image")
        assert exc_info.value.status_code == 400

    def test_valid_image_is_sanitised_and_ext_returned(self):
        data, ext = validate_and_sanitize(FakeUploadFile(_image_bytes("PNG")), allowed="image")

        assert ext == "png"
        assert data[:8] == b"\x89PNG\r\n\x1a\n"

    def test_tiff_input_reports_png_as_its_final_extension(self):
        _, ext = validate_and_sanitize(FakeUploadFile(_image_bytes("TIFF")), allowed="image")

        assert ext == "png"  # re-encoded, so the saved extension changes too

    def test_pdf_bytes_pass_through_unchanged(self):
        data, ext = validate_and_sanitize(FakeUploadFile(PDF_BYTES), allowed="pdf")

        assert ext == "pdf"
        assert data == PDF_BYTES  # PDFs skip _strip_exif entirely


class TestSaveImageLocal:
    def test_save_gross_image_writes_under_the_specimen_id_and_returns_its_url(self, monkeypatch, tmp_path):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)

        url = _run(save_gross_image_local(42, FakeUploadFile(_image_bytes("PNG"))))

        assert url.startswith("/storage/gross_images/42/")
        assert url.endswith(".png")
        saved_path = tmp_path / "gross_images" / "42" / url.rsplit("/", 1)[-1]
        assert saved_path.exists()

    def test_save_nongyne_image_writes_under_the_case_id(self, monkeypatch, tmp_path):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)

        url = _run(save_nongyne_image_local(7, FakeUploadFile(_image_bytes("JPEG"))))

        assert url.startswith("/storage/nongyne_images/7/")
        assert (tmp_path / "nongyne_images" / "7").exists()

    def test_save_gyne_image_writes_under_the_case_id(self, monkeypatch, tmp_path):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)

        url = _run(save_gyne_image_local(9, FakeUploadFile(_image_bytes("JPEG"))))

        assert url.startswith("/storage/gyne_images/9/")
        assert (tmp_path / "gyne_images" / "9").exists()


class TestDeleteImageLocal:
    # The path-traversal guard (`file_path.is_relative_to(storage_root)`) is
    # defense-in-depth: the regex fullmatch above it only allows
    # `\d+/[\w\-]+\.\w+`, which already excludes "/" and ".." from the
    # filename segment — so a real bypass of the regex that still escapes
    # STORAGE_ROOT isn't constructible through this function's public
    # contract. Both checks are exercised together below via malformed URLs.

    def test_rejects_a_malformed_url(self):
        with pytest.raises(ValueError):
            delete_gross_image_local("/storage/gross_images/../../etc/passwd")

    def test_rejects_a_url_for_the_wrong_image_kind(self):
        with pytest.raises(ValueError):
            delete_gross_image_local("/storage/gyne_images/1/abc.png")

    def test_deletes_an_existing_gross_image_and_returns_true(self, monkeypatch, tmp_path):
        # Regression: previously used `.lstrip("/storage/")`, which strips a
        # *character set* {'/','s','t','o','r','a','g','e'}, not the literal
        # prefix — every letter of "gross" is in that set, so the whole word
        # got eaten too ("/storage/gross_images/1/x.png" -> "_images/1/x.png"),
        # meaning the file was never found and this always returned False
        # without raising. Fixed via .removeprefix("/storage/").
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        dest = tmp_path / "gross_images" / "1"
        dest.mkdir(parents=True)
        (dest / "abc123.png").write_bytes(b"fake png bytes")

        result = delete_gross_image_local("/storage/gross_images/1/abc123.png")

        assert result is True
        assert not (dest / "abc123.png").exists()

    def test_deletes_an_existing_gyne_image_and_returns_true(self, monkeypatch, tmp_path):
        # Regression: same root cause, off-by-one symptom — "gyne_images"
        # starts with "g", which *is* in the old lstrip char-set, so just
        # the leading "g" got eaten too.
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        dest = tmp_path / "gyne_images" / "9"
        dest.mkdir(parents=True)
        (dest / "abc123.png").write_bytes(b"fake png bytes")

        result = delete_gyne_image_local("/storage/gyne_images/9/abc123.png")

        assert result is True
        assert not (dest / "abc123.png").exists()

    def test_nongyne_image_delete_still_works(self, monkeypatch, tmp_path):
        # "nongyne_images" starts with "n", which was never in the old
        # lstrip char-set, so this one always worked — by coincidence, not
        # by correct code. Still covered here since removeprefix changed it too.
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        dest = tmp_path / "nongyne_images" / "3"
        dest.mkdir(parents=True)
        (dest / "abc123.png").write_bytes(b"fake png bytes")

        assert delete_nongyne_image_local("/storage/nongyne_images/3/abc123.png") is True
        assert not (dest / "abc123.png").exists()

    def test_missing_file_returns_false_without_raising(self, monkeypatch, tmp_path):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)

        assert delete_nongyne_image_local("/storage/nongyne_images/1/does-not-exist.png") is False

    def test_delete_nongyne_and_gyne_use_their_own_url_patterns(self, monkeypatch, tmp_path):
        monkeypatch.setattr(file_handler, "STORAGE_ROOT", tmp_path)
        with pytest.raises(ValueError):
            delete_nongyne_image_local("/storage/gross_images/1/abc.png")
        with pytest.raises(ValueError):
            delete_gyne_image_local("/storage/nongyne_images/1/abc.png")


def _run(coro):
    import asyncio
    return asyncio.run(coro)
