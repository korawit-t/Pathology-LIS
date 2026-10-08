"""Tests for app/utils/slide_sticker_pdf_generator.py — reportlab-based
sticker PDF rendering. Page count and page dimensions are verified via
pypdf.PdfReader rather than trying to assert on drawn pixel content."""

import io

from pypdf import PdfReader

from app.utils import slide_sticker_pdf_generator as gen
from app.utils.slide_sticker_pdf_generator import _fmt_date, generate_slide_sticker_pdf


class TestFmtDate:
    def test_formats_an_iso_date_as_dd_mm_yy(self):
        assert _fmt_date("2026-01-15") == "15/01/26"

    def test_none_or_empty_returns_empty_string(self):
        assert _fmt_date(None) == ""
        assert _fmt_date("") == ""

    def test_non_iso_string_is_returned_unchanged(self):
        assert _fmt_date("not-a-date") == "not-a-date"


def _item(**overrides):
    fields = dict(accession_no="S26-00001", block_code="A1", stain_display="H&E", hospital_code="HOSP", reg_date="2026-01-15")
    fields.update(overrides)
    return fields


class TestGenerateSlideStickerPdf:
    def test_produces_valid_pdf_bytes(self):
        result = generate_slide_sticker_pdf([_item()])

        assert result[:4] == b"%PDF"

    def test_one_page_per_item(self):
        result = generate_slide_sticker_pdf([_item(accession_no="S26-1"), _item(accession_no="S26-2"), _item(accession_no="S26-3")])

        reader = PdfReader(io.BytesIO(result))
        assert len(reader.pages) == 3

    def test_landscape_orientation_swaps_width_and_height(self):
        portrait = generate_slide_sticker_pdf([_item()], sticker_width_cm=2.0, sticker_height_cm=3.0, sticker_orientation="portrait")
        landscape = generate_slide_sticker_pdf([_item()], sticker_width_cm=2.0, sticker_height_cm=3.0, sticker_orientation="landscape")

        p_box = PdfReader(io.BytesIO(portrait)).pages[0].mediabox
        l_box = PdfReader(io.BytesIO(landscape)).pages[0].mediabox

        assert round(float(p_box.width)) == round(float(l_box.height))
        assert round(float(p_box.height)) == round(float(l_box.width))

    def test_missing_reg_date_omits_the_date_row_without_crashing(self):
        result = generate_slide_sticker_pdf([_item(reg_date=None)])

        assert result[:4] == b"%PDF"

    def test_missing_stain_display_omits_that_text_without_crashing(self):
        result = generate_slide_sticker_pdf([_item(stain_display="")])

        assert result[:4] == b"%PDF"


class TestQrPayload:
    """What lands in the QR is the contract Slide Storage's scan box matches
    against; the two deriving it separately is what broke scanning before."""

    @staticmethod
    def _drawn(monkeypatch, items):
        seen = []
        monkeypatch.setattr(
            gen, "_draw_qr", lambda c, data, x, y, size: seen.append(data)
        )
        generate_slide_sticker_pdf(items)
        return seen

    def test_prints_the_slide_id_the_caller_supplies(self, monkeypatch):
        assert self._drawn(monkeypatch, [_item(scan_code="BKK01-SBS-48215")]) == [
            "BKK01-SBS-48215"
        ]

    def test_falls_back_to_accession_and_block_without_a_scan_code(self, monkeypatch):
        # Keeps a caller that has not been moved over printing something
        # scannable rather than an empty QR.
        assert self._drawn(monkeypatch, [_item()]) == ["S26-00001A1"]

    def test_an_empty_scan_code_falls_back_rather_than_printing_nothing(
        self, monkeypatch
    ):
        assert self._drawn(monkeypatch, [_item(scan_code="")]) == ["S26-00001A1"]

    def test_each_item_gets_its_own_payload(self, monkeypatch):
        drawn = self._drawn(
            monkeypatch,
            [_item(scan_code="SBS-1"), _item(scan_code="SBS-2")],
        )
        assert drawn == ["SBS-1", "SBS-2"]
