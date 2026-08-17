"""Probes for reading a rendered report PDF back.

Shared by the barcode tests, which assert against the printed page rather than
the template source so they catch any re-introduced CSS scaling — see
test_report_barcode_size.py's module docstring.
"""

import fitz

PT2MM = 25.4 / 72


def footer_barcode_bars(page_or_pdf) -> list:
    """The barcode's vector rects: thin, tall, in the bottom margin band.

    Accepts a fitz page or the raw PDF bytes of a report (first page).
    """
    page = (
        fitz.open(stream=page_or_pdf, filetype="pdf")[0]
        if isinstance(page_or_pdf, (bytes, bytearray))
        else page_or_pdf
    )
    h_mm = page.rect.height * PT2MM
    return [
        d["rect"]
        for d in page.get_drawings()
        if d["rect"].y0 * PT2MM > h_mm - 30 and d["rect"].width < 12 and d["rect"].height > 5
    ]
