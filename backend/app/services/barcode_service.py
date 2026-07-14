"""
Barcode generation utility for generating Code 39 barcodes as SVG images.
"""

import io
import re
import base64
from barcode.codex import Code39
from barcode.writer import SVGWriter

# Code 39 X-dimension (narrow bar width). 0.36mm (~14 mil) is still within
# the standard scanner-safe range for CCD/laser barcode readers used by HIS
# integrations. Sized against the widest realistic barcode value (14-char
# visit-type prefix + case-type code + VN/AN) so it stays under the
# barcode-area column width in barcode_label_template.html with margin to
# spare - if this is raised further, re-check that fit (see that template's
# .barcode-area img comment) or the label column will silently downscale it.
_MODULE_WIDTH_MM = 1.3
_MODULE_HEIGHT_MM = 24
_QUIET_ZONE_MM = 6.5  # Code 39 spec minimum quiet zone; python-barcode's own default.

_SVG_SIZE_RE = re.compile(r'width="([\d.]+)mm"\s+height="([\d.]+)mm"')


def generate_code39_base64_img(data: str) -> tuple[str, float, float]:
    """
    Generate a Code 39 barcode and return (data_uri, width_mm, height_mm).

    Rendered as an SVG (vector rects), not a raster PNG. The old LIS this
    project replaces drew its barcode via mPDF's native <barcode type="c39">
    tag - pure vector, no raster scaling involved anywhere in the pipeline.
    A raster PNG stretched/scaled by CSS can pick up interpolation blur at
    bar edges wherever the source pixel grid doesn't land exactly on the
    print grid, and that blur doesn't go away by printing it bigger. A
    phone camera's decoder binarizes through that blur easily; a dedicated
    CCD/laser scanner (e.g. one wired into HOSxP) reading reflected light
    intensity along a scan line is far less forgiving of soft edges. SVG
    rects have no such risk - WeasyPrint draws them as real vector paths in
    the PDF, exactly like the old mPDF barcode tag did.

    width_mm/height_mm are the barcode's true physical size (already
    encoded as absolute mm in the SVG's own width/height attributes) so
    callers can pin the <img> to that exact size rather than a "100%"/
    "auto" that would just re-introduce scaling.
    """
    if not data or not data.strip():
        return "", 0.0, 0.0

    # Clean the data: Code 39 only supports uppercase + digits + some special chars
    clean_data = data.strip().upper()

    # add_checksum=False prevents python-barcode from appending a Mod 43 checksum character
    code39 = Code39(clean_data, writer=SVGWriter(), add_checksum=False)

    svg_io = io.BytesIO()
    code39.write(
        svg_io,
        options={
            "module_width": _MODULE_WIDTH_MM,
            "module_height": _MODULE_HEIGHT_MM,
            "font_size": 0,  # Hide text (we render it separately in HTML)
            "text_distance": 1,
            "quiet_zone": _QUIET_ZONE_MM,
        },
    )

    svg_bytes = svg_io.getvalue()

    match = _SVG_SIZE_RE.search(svg_bytes.decode("utf-8"))
    width_mm, height_mm = (
        (float(match.group(1)), float(match.group(2))) if match else (0.0, 0.0)
    )

    # Base64 encode the SVG bytes to create a Data URI
    b64_encoded = base64.b64encode(svg_bytes).decode("utf-8")
    data_uri = f"data:image/svg+xml;base64,{b64_encoded}"

    return data_uri, width_mm, height_mm
