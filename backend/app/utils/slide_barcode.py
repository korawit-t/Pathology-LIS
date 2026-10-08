"""What a slide sticker's QR code contains — in one place.

The sticker generator prints this payload and Slide Storage's scan box has to
match a freshly scanned slide back to its pending row. The two used to build
the string independently and had drifted apart (`S26-00123A01` printed against
a `S26-00123 A1 (H&E #1)` row), so scanning reported "not found" for slides
Manual Select listed perfectly well. Both sides now call in here.
"""

import re
from typing import List, Optional


def pad_block_code(code: str) -> str:
    """Zero-pad the trailing block number for stickers: A1 -> A01, A11 -> A11."""
    m = re.match(r"^([A-Za-z]*)(\d+)$", code or "")
    if not m:
        return code or ""
    letters, digits = m.groups()
    return f"{letters}{digits.zfill(2)}"


def slide_qr_payload(accession_no: Optional[str], block_code: Optional[str]) -> str:
    """The exact string encoded in a slide sticker's QR code.

    `block_code` is whatever that sticker's caller labels the slide with — a
    padded surgical block code (`A01`), or `#2` for a cytology slide, which has
    no block.
    """
    return f"{accession_no or ''}{block_code or ''}"


def slide_scan_codes(
    accession_no: Optional[str], block_code: Optional[str]
) -> List[str]:
    """Every QR payload a sticker for this slide could be carrying.

    Slides are filed for years and outlive a change to the sticker layout, so a
    drawer holds both the zero-padded block code printed today and the unpadded
    one older stickers went out with. Scanning either has to find the slide.
    """
    padded = slide_qr_payload(accession_no, pad_block_code(block_code or ""))
    raw = slide_qr_payload(accession_no, block_code)
    return [padded] if padded == raw else [padded, raw]
