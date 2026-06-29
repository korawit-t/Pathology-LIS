"""
Barcode generation utility for generating Code 39 barcodes as base64 images.
"""

import io
import base64
from barcode.codex import Code39
from barcode.writer import ImageWriter


def generate_code39_base64_img(data: str) -> str:
    """
    Generate a Code 39 barcode and return it as a Base64 PNG Data URI string.
    Code 39 supports: A-Z, 0-9, space, and - . $ / + %
    """
    if not data or not data.strip():
        return ""

    # Clean the data: Code 39 only supports uppercase + digits + some special chars
    clean_data = data.strip().upper()

    # add_checksum=False prevents python-barcode from appending a Mod 43 checksum character
    code39 = Code39(clean_data, writer=ImageWriter(), add_checksum=False)

    # Write to in-memory buffer
    img_io = io.BytesIO()
    code39.write(
        img_io,
        options={
            "module_width": 1.3,
            "module_height": 15,
            "font_size": 0,  # Hide text in PNG (we render it separately in HTML)
            "text_distance": 1,
            "quiet_zone": 2,
            "dpi": 300,  # High DPI for crisp printing
            "format": "PNG",
        },
    )

    img_bytes = img_io.getvalue()

    # Base64 encode the PNG bytes to create a Data URI
    b64_encoded = base64.b64encode(img_bytes).decode("utf-8")
    data_uri = f"data:image/png;base64,{b64_encoded}"

    return data_uri
