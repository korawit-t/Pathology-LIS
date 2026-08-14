"""
The surgical report's footer barcode must reach the paper at the X-dimension
it was generated at.

It previously did not: barcode_service produced a 1.3mm X-dimension and the
template then pinned the <img> to `height: 32px`, scaling the whole symbol to
32.5% and leaving a 0.423mm X-dimension on paper. A print-and-scan sweep on
site (0.423 -> 0.13mm, one size per page) found this deployment's printer
resolves down to 0.35mm and no further, so 0.423mm was already at the edge and
anything narrower is unreadable.

These tests measure the rendered PDF rather than the template source, so they
fail for *any* re-introduced scaling — a CSS height, a width:100%, a transform
— not just the one that caused the original bug.
"""

import fitz
import pytest

from app.services.barcode_service import (
    generate_code39_base64_img,
    _REPORT_MODULE_WIDTH_MM,
    _REPORT_MODULE_HEIGHT_MM,
    _MODULE_WIDTH_MM,
)
from app.services.pdf_service import generate_pdf_blob

PT2MM = 25.4 / 72
VALUE = "208690807084156"  # real 15-char OPD value: prefix 2 + type 08 + 12-digit VN


def _render_report() -> fitz.Document:
    svg, w_mm, h_mm = generate_code39_base64_img(
        VALUE, _REPORT_MODULE_WIDTH_MM, _REPORT_MODULE_HEIGHT_MM
    )
    pdf = generate_pdf_blob(
        {
            "report_footer_snapshot": "Footer here",
            "preview_date": "14/08/2026 11:45",
            "barcode_svg": svg,
            "barcode_width_mm": w_mm,
            "barcode_height_mm": h_mm,
            "barcode_value": VALUE,
            "patient_hn": "0086209",
            "accession_no": "S26-02047",
        },
        "reports/surgical_report_template.html",
    )
    return fitz.open(stream=pdf, filetype="pdf")


def _footer_bars(page):
    """The barcode's vector rects — thin, tall, in the bottom margin band."""
    h_mm = page.rect.height * PT2MM
    return [
        d["rect"]
        for d in page.get_drawings()
        if d["rect"].y0 * PT2MM > h_mm - 30 and d["rect"].width < 12 and d["rect"].height > 5
    ]


class TestGeneratedSize:
    def test_service_honours_the_requested_module_size(self):
        _, w_mm, h_mm = generate_code39_base64_img(
            VALUE, _REPORT_MODULE_WIDTH_MM, _REPORT_MODULE_HEIGHT_MM
        )
        # 15 data chars + start/stop = 17 chars x 16 modules - 1, plus 2x6.5mm quiet
        assert w_mm == pytest.approx(271 * _REPORT_MODULE_WIDTH_MM + 13, abs=0.5)
        assert h_mm == pytest.approx(_REPORT_MODULE_HEIGHT_MM, abs=2.5)

    def test_label_callers_keep_the_full_size(self):
        """Labels share the generator; the report's smaller size must not leak."""
        _, w_mm, _ = generate_code39_base64_img(VALUE)
        assert w_mm == pytest.approx(271 * _MODULE_WIDTH_MM + 13, abs=0.5)


class TestRenderedSize:
    def test_printed_x_dimension_matches_what_was_generated(self):
        """The regression guard: no CSS scaling between SVG and paper."""
        page = _render_report()[0]
        bars = _footer_bars(page)
        assert bars, "no barcode found in the report footer"

        narrow_mm = min(r.width for r in bars) * PT2MM
        assert narrow_mm == pytest.approx(_REPORT_MODULE_WIDTH_MM, abs=0.01), (
            f"X-dimension reached paper at {narrow_mm:.3f}mm instead of "
            f"{_REPORT_MODULE_WIDTH_MM}mm — something is scaling the barcode again"
        )

    def test_printed_bar_height_matches_what_was_generated(self):
        page = _render_report()[0]
        bars = _footer_bars(page)
        height_mm = (max(r.y1 for r in bars) - min(r.y0 for r in bars)) * PT2MM
        assert height_mm == pytest.approx(_REPORT_MODULE_HEIGHT_MM, abs=0.5)

    def test_stays_above_the_site_printer_resolution_floor(self):
        """0.35mm is the measured floor for this deployment's printer."""
        page = _render_report()[0]
        narrow_mm = min(r.width for r in _footer_bars(page)) * PT2MM
        assert narrow_mm >= 0.35 - 0.01

    def test_barcode_does_not_overlap_the_footer_text(self):
        page = _render_report()[0]
        h_mm = page.rect.height * PT2MM
        bars = _footer_bars(page)
        bx0, bx1 = min(r.x0 for r in bars) * PT2MM, max(r.x1 for r in bars) * PT2MM

        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                x0, y0, x1, _ = line["bbox"]
                text = "".join(s["text"] for s in line["spans"]).strip()
                # the barcode's own caption sits under it, centred — skip it
                if y0 * PT2MM < h_mm - 30 or text == VALUE or text.startswith("S26-"):
                    continue
                assert x1 * PT2MM <= bx0 or x0 * PT2MM >= bx1, (
                    f"footer text {text!r} overlaps the barcode "
                    f"({x0 * PT2MM:.1f}-{x1 * PT2MM:.1f}mm vs {bx0:.1f}-{bx1:.1f}mm)"
                )
