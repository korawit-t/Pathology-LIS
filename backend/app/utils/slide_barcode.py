"""What a slide sticker's QR code contains — in one place.

The sticker generator prints this payload and Slide Storage's scan box has to
match a freshly scanned slide back to its pending row. The two used to build
the string independently and had drifted apart (`S26-00123A01` printed against
a `S26-00123 A1 (H&E #1)` row), so scanning reported "not found" for slides
Manual Select listed perfectly well. Both sides now call in here.

The payload identifies the slide itself — `<lab>-SBS-48215` — rather than the
block it came from. The old accession+block composite named a block, so every
slide cut from one shared a payload and the system could not tell which slide
was in your hand. `slide_scan_codes` is deliberately more liberal than
`slide_label_code`: we print one form and accept every form a sticker in the
drawers could be carrying.
"""

import re
from typing import List, Optional

# Which table a payload's id belongs to. Short because the whole point of
# identifying the slide by id is to keep the QR at version 1 (21x21 modules);
# a longer payload prints a denser code on a 2cm sticker for no gain.
KIND_SURGICAL = "SBS"
KIND_GYNE = "GYN"
KIND_NONGYNE = "NGY"
KIND_HE_CONTROL = "HEC"


def pad_block_code(code: str) -> str:
    """Zero-pad the trailing block number for stickers: A1 -> A01, A11 -> A11."""
    m = re.match(r"^([A-Za-z]*)(\d+)$", code or "")
    if not m:
        return code or ""
    letters, digits = m.groups()
    return f"{letters}{digits.zfill(2)}"


def slide_label_code(kind: str, pk: int, lab_code: Optional[str] = None) -> str:
    """The payload printed in a slide sticker's QR today.

    `lab_code` namespaces the id so two deployments of this LIS cannot both
    mint `SBS-48215` — it matters when a slide leaves the building for an
    outlab consult, or when a WSI scanner names a file after the label. It is
    optional: an installation that has not set one prints the bare id, which is
    still unique within its own database.
    """
    bare = f"{kind}-{pk}"
    lab = (lab_code or "").strip()
    return f"{lab}-{bare}" if lab else bare


def legacy_slide_qr_payload(
    accession_no: Optional[str], block_code: Optional[str]
) -> str:
    """The accession+block composite stickers were printed with before slides
    were identified by id. Kept because the drawers are full of them."""
    return f"{accession_no or ''}{block_code or ''}"


def slide_scan_codes(
    kind: str,
    pk: int,
    *,
    lab_code: Optional[str] = None,
    legacy_accession_no: Optional[str] = None,
    legacy_block_code: Optional[str] = None,
) -> List[str]:
    """Every payload a sticker for this slide could be carrying.

    Slides are filed for years and outlive both a change to the sticker layout
    and a change to `lab_code`, so this accepts, in order of how recently it
    was printed: the namespaced id, the bare id, and the accession+block
    composite with the block code padded and unpadded. The bare id is accepted
    even when a `lab_code` is set, so renaming the lab never orphans a sticker.
    """
    codes = [slide_label_code(kind, pk, lab_code)]
    bare = slide_label_code(kind, pk)
    if bare not in codes:
        codes.append(bare)

    if legacy_accession_no:
        padded = legacy_slide_qr_payload(
            legacy_accession_no, pad_block_code(legacy_block_code or "")
        )
        raw = legacy_slide_qr_payload(legacy_accession_no, legacy_block_code)
        for c in (padded, raw):
            if c and c not in codes:
                codes.append(c)

    return codes
