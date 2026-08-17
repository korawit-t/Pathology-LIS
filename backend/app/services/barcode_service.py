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

# Report-footer sizing. The full-size label geometry above does not fit the
# report's bottom margin band, so the footer barcode is generated smaller —
# but generated at its final size, never CSS-scaled down from the big one.
#
# 0.35mm was measured, not guessed: a 7-step print-and-scan sweep
# (0.423 -> 0.13mm) on this site's own report printer and HOSxP scanner read
# down to 0.35mm and failed below it, the printer being the limiting factor.
# 10mm is the bar height that sweep was run at — the two were validated
# together, so changing one invalidates the result for the other.
_REPORT_MODULE_WIDTH_MM = 0.35
_REPORT_MODULE_HEIGHT_MM = 10

_SVG_SIZE_RE = re.compile(r'width="([\d.]+)mm"\s+height="([\d.]+)mm"')


def generate_code39_base64_img(
    data: str,
    module_width_mm: float = _MODULE_WIDTH_MM,
    module_height_mm: float = _MODULE_HEIGHT_MM,
) -> tuple[str, float, float]:
    """
    Generate a Code 39 barcode and return (data_uri, width_mm, height_mm).

    Callers that need a different physical size (the report footer, which
    cannot fit the full label geometry) pass their own module dimensions so
    the symbol is *generated* at its final size. Do not instead render the
    default size and shrink it with CSS: that is what produced a 0.423mm
    X-dimension in the surgical report and made it unscannable.

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
            "module_width": module_width_mm,
            "module_height": module_height_mm,
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


def has_scannable_visit(case) -> bool:
    """Whether a case carries a visit number the HIS can resolve.

    The report footer barcode exists so the HIS can pull the signed report onto
    a visit, so it is printed only when there is a VN or an AN to encode. Cases
    without either — registered before their case type captured visit data, or
    imported with no matching HIS visit — get no footer barcode at all rather
    than one that scans to a dead end.

    The label sheet is deliberately not gated on this: its accession-number
    fallback is scanned for in-lab tracking, not by the HIS.
    """
    vn = ((getattr(case, "vn", "") or "") if case else "").strip()
    an = ((getattr(case, "an", "") or "") if case else "").strip()
    return bool(vn or an)


def generate_report_footer_barcode(data: str) -> tuple[str, float, float]:
    """Generate a barcode at the size the report footer band can hold.

    Every report template that prints a footer barcode goes through here, so
    the validated footer geometry stays in one place instead of each caller
    reaching for the module-private constants.
    """
    return generate_code39_base64_img(
        data,
        module_width_mm=_REPORT_MODULE_WIDTH_MM,
        module_height_mm=_REPORT_MODULE_HEIGHT_MM,
    )
