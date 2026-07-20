from io import BytesIO
from datetime import datetime
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from typing import List, Dict, Any

_FONT_DIR = Path(__file__).parent.parent.parent / "assets" / "fonts"
pdfmetrics.registerFont(TTFont("Sarabun", str(_FONT_DIR / "Sarabun-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Sarabun-Bold", str(_FONT_DIR / "Sarabun-Bold.ttf")))


def _fmt_date(raw: str | None) -> str:
    if not raw:
        return ""
    try:
        return datetime.fromisoformat(raw).strftime("%d/%m/%y")
    except Exception:
        return raw


def _draw_qr(c: canvas.Canvas, data: str, x: float, y: float, size: float) -> None:
    qr = QrCodeWidget(data)
    bounds = qr.getBounds()
    qr_w = bounds[2] - bounds[0]
    qr_h = bounds[3] - bounds[1]
    d = Drawing(size, size, transform=[size / qr_w, 0, 0, size / qr_h, 0, 0])
    d.add(qr)
    renderPDF.draw(d, c, x, y)


def generate_slide_sticker_pdf(
    items: List[Dict[str, Any]],
    sticker_width_cm: float = 2.0,
    sticker_height_cm: float = 2.0,
    sticker_orientation: str = "portrait",
    font_accession: int = 7,
    font_block: int = 7,
    font_stain: int = 6,
    font_hospital: int = 6,
    font_date: int = 5,
    font_hn: int = 5,
    margin_top_cm: float = 0.0,
    qr_scale: float = 1.0,
    qr_offset_x_cm: float = 0.0,
    qr_offset_y_cm: float = 0.0,
) -> bytes:
    buffer = BytesIO()

    # Swap dimensions for landscape orientation
    if sticker_orientation == "landscape":
        sticker_width_cm, sticker_height_cm = sticker_height_cm, sticker_width_cm

    # Scale layout positions relative to 2.0 cm baseline; font sizes scale the same way
    sw = sticker_width_cm / 2.0
    sh = sticker_height_cm / 2.0
    size_scale = min(sw, sh)

    sticker_w = sticker_width_cm * cm
    sticker_h = sticker_height_cm * cm

    c = canvas.Canvas(buffer, pagesize=(sticker_w, sticker_h))

    text_x = 0.06 * sw * cm
    qr_size = 0.78 * size_scale * cm * max(0.3, qr_scale)
    qr_x = sticker_w - qr_size - 0.05 * sw * cm + qr_offset_x_cm * cm

    # Row positions — computed from top so layout is flush regardless of sticker height.
    # margin_top_cm is absolute (cm), always added regardless of sticker size.
    TOP_GAP = 0.05 * sh * cm + margin_top_cm * cm
    ROW_STEP = (
        0.24 * sh * cm
    )  # vertical spacing between rows (TEST: tightened to fit row 5)

    row1_y = sticker_h - TOP_GAP - 0.20 * sh * cm  # ascent buffer for Row 1 font
    row2_y = row1_y - ROW_STEP
    row3_y = row2_y - ROW_STEP
    row4_y = row3_y - ROW_STEP
    row5_y = row4_y - ROW_STEP  # TEST: extra row for HN

    # Center QR in the lower text area (row3–row4) so it stays below the date row
    qr_y = (row4_y + row1_y - qr_size) / 2 - ROW_STEP + qr_offset_y_cm * cm

    for item in items:
        accession_no = item.get("accession_no", "")
        block_code = item.get("block_code", "")
        stain_display = item.get("stain_display", "")
        hospital_code = item.get("hospital_code", "")
        hn = item.get("hn", "")
        reg_date = _fmt_date(item.get("reg_date"))

        qr_data = f"{accession_no}{block_code}"

        # Row 1: Accession No
        c.setFont("Sarabun-Bold", max(4, round(font_accession * size_scale)))
        c.drawString(text_x, row1_y, accession_no)

        # Row 2: Block code + Stain type (same line)
        block_font_pt = max(4, round(font_block * size_scale))
        stain_font_pt = max(4, round(font_stain * size_scale))
        c.setFont("Sarabun-Bold", block_font_pt)
        c.drawString(text_x, row2_y, block_code)
        if stain_display:
            block_w = c.stringWidth(block_code, "Sarabun-Bold", block_font_pt)
            c.setFont("Sarabun", stain_font_pt)
            c.drawString(text_x + block_w + 0.08 * sw * cm, row2_y, stain_display)

        # Row 3: Hospital code
        c.setFont("Sarabun-Bold", max(4, round(font_hospital * size_scale)))
        c.drawString(text_x, row3_y, hospital_code)

        # Row 4: Date
        if reg_date:
            date_font_pt = max(4, round(font_date * size_scale))
            c.setFont("Sarabun", date_font_pt)
            c.drawString(text_x, row4_y, reg_date)

        # Row 5: HN (TEST)
        if hn:
            c.setFont("Sarabun", max(4, round(font_hn * size_scale)))
            c.drawString(text_x, row5_y, f"HN: {hn}")

        # QR code spans rows 4–5 on the right
        _draw_qr(c, qr_data, qr_x, qr_y, qr_size)

        c.showPage()

    c.save()
    pdf_out = buffer.getvalue()
    buffer.close()
    return pdf_out
