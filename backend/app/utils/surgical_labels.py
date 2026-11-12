"""How surgical specimens and blocks are labelled — in one place.

Two schemes, picked per installation in System Settings:

* ``letter_number`` (the default, and the only scheme before this existed):
  specimens A, B, C; blocks numbered within their specimen — A1, A2, B1.
* ``number_letter``: specimens 1, 2, 3; blocks lettered A, B, C … Z, AA, AB
  in one run across the whole case, whichever specimen they belong to. A block
  added to specimen 1 after specimens 2 and 3 were cut takes the next letter
  after the last one in the case.

The scheme a case uses is read from the case itself, not from the setting:
numeric specimen labels mean ``number_letter``. The setting only decides what
the first specimen of a case is called, so switching it never relabels a case
that already has specimens — their cassettes and slides are already printed.

In ``number_letter`` a block's letter comes from ``SurgicalBlock.case_block_seq``.
``block_no`` keeps numbering blocks within their specimen in both schemes, so
everything keyed on (specimen_id, block_no) is untouched.

While the case is still in the gross room the letters follow specimen order and
are re-sorted whenever a block or specimen is added or deleted: specimen 1 A B C,
specimen 2 D — add a block to specimen 1 and it becomes A B C D, specimen 2 E.
Once anything has left the room (``case_labels_fixed``) the letters are fixed:
a later block takes the letter after the last one in the case (specimen 1
A B C E, specimen 2 still D) and a delete follows System Settings
``surgical_block_delete_mode``. Past that point the cassettes and slides carry
the letters, and renaming a block under them would point at the wrong tissue.
"""

from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

SCHEME_LETTER_NUMBER = "letter_number"
SCHEME_NUMBER_LETTER = "number_letter"

DELETE_RENUMBER = "renumber"
DELETE_KEEP_GAP = "keep_gap"


def seq_to_letters(n: int) -> str:
    """1 -> A, 26 -> Z, 27 -> AA, 28 -> AB, 703 -> AAA (spreadsheet columns)."""
    if n is None or n < 1:
        return ""
    letters = ""
    while n:
        n, rem = divmod(n - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def letters_to_seq(letters: str) -> Optional[int]:
    """Inverse of seq_to_letters; None for anything that is not A-Z only."""
    if not letters or not letters.isascii() or not letters.isalpha():
        return None
    n = 0
    for ch in letters.upper():
        n = n * 26 + (ord(ch) - 64)
    return n


def is_numeric_label(label: Optional[str]) -> bool:
    return bool(label) and label.isascii() and label.isdigit()


def label_sort_key(label: Optional[str]):
    """Sort specimen labels in the order they were issued.

    Shorter first, then alphabetical: A..Z sort exactly as a plain string sort
    would, and 1..9 come before 10 instead of "10" landing between 1 and 2.
    """
    label = label or ""
    return (len(label), label)


def label_order_by(column):
    """SQL equivalent of label_sort_key, for ``.order_by(*label_order_by(col))``."""
    return (func.length(column), column)


def configured_scheme(db: Session) -> str:
    # Read-only on purpose: crud.system_setting.get_settings creates and
    # commits the row when it is missing, which must not happen half-way
    # through a specimen being created.
    from app.models.system_setting import SystemSetting

    value = (
        db.query(SystemSetting.surgical_label_scheme)
        .filter(SystemSetting.hospital_slug == "master")
        .scalar()
    )
    return value if value == SCHEME_NUMBER_LETTER else SCHEME_LETTER_NUMBER


def configured_delete_mode(db: Session) -> str:
    from app.models.system_setting import SystemSetting

    value = (
        db.query(SystemSetting.surgical_block_delete_mode)
        .filter(SystemSetting.hospital_slug == "master")
        .scalar()
    )
    return value if value == DELETE_KEEP_GAP else DELETE_RENUMBER


def scheme_of_labels(labels: Iterable[Optional[str]]) -> Optional[str]:
    """The scheme existing specimen labels are in, or None if there are none."""
    labels = [label for label in labels if label]
    if not labels:
        return None
    return SCHEME_NUMBER_LETTER if is_numeric_label(labels[0]) else SCHEME_LETTER_NUMBER


def case_label_scheme(db: Session, case_id: int) -> str:
    """The scheme a case uses: its specimens decide; the setting only applies
    to a case that has none yet."""
    from app.models.surgical_specimen import SurgicalSpecimen

    labels = [
        row[0]
        for row in db.query(SurgicalSpecimen.specimen_label)
        .filter(SurgicalSpecimen.case_id == case_id)
        .all()
    ]
    return scheme_of_labels(labels) or configured_scheme(db)


def specimen_label_at(index: int, scheme: str) -> str:
    """Label of the specimen at 0-based position ``index``."""
    if scheme == SCHEME_NUMBER_LETTER:
        return str(index + 1)
    return seq_to_letters(index + 1)


def next_specimen_label(existing: Iterable[Optional[str]], scheme: str) -> str:
    """The label after the highest one already in the case."""
    existing = [label for label in existing if label]
    if not existing:
        return specimen_label_at(0, scheme)
    if scheme == SCHEME_NUMBER_LETTER:
        return str(max((int(label) for label in existing if is_numeric_label(label)), default=0) + 1)
    highest = max(existing, key=label_sort_key)
    seq = letters_to_seq(highest)
    if seq is None:
        # A label that is not plain letters: keep the historic behaviour.
        return chr(ord(highest[-1]) + 1)
    return seq_to_letters(seq + 1)


def case_labels_fixed(db: Session, case_id: int) -> bool:
    """True once a case's block letters may no longer move.

    Any of these means the letters are out on real cassettes or slides:
    * the case status is past ``grossed`` (processed, stained, pending
      diagnosis …) or a pathologist has asked for additional sections;
    * a block of the case has left ``grossed`` (processing, embedded,
      sectioned, stained) — the case itself stays ``grossed`` until a
      processing run completes, so its status alone misses blocks already
      in the processor;
    * a slide sticker of the case has been printed — with the tissue
      processing workflow switched off that can happen while the case is
      still ``grossed``.
    """
    from app.enums.case_states import surgical_past
    from app.models.surgical_block import SurgicalBlock
    from app.models.surgical_block_stain import SurgicalBlockStain
    from app.models.surgical_case import SurgicalCase
    from app.models.surgical_specimen import SurgicalSpecimen

    status = db.query(SurgicalCase.status).filter(SurgicalCase.id == case_id).scalar()
    if surgical_past(status, "grossed"):
        return True

    if (
        db.query(SurgicalSpecimen.id)
        .filter(
            SurgicalSpecimen.case_id == case_id,
            SurgicalSpecimen.needs_additional_sections.is_(True),
        )
        .first()
        is not None
    ):
        return True

    case_blocks = (
        db.query(SurgicalBlock.id)
        .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
        .filter(SurgicalSpecimen.case_id == case_id)
    )
    if case_blocks.filter(SurgicalBlock.status != "grossed").first() is not None:
        return True

    return (
        db.query(SurgicalBlockStain.id)
        .filter(
            SurgicalBlockStain.block_id.in_(case_blocks.subquery().select()),
            SurgicalBlockStain.is_printed.is_(True),
        )
        .first()
        is not None
    )


def resequence_case_blocks(db: Session, case_id: int) -> None:
    """Re-letter every block of a number_letter case in specimen order, then
    block order: A, B, C … with no gaps. Only for a case still in the gross
    room (see case_labels_fixed). The caller holds the case row lock."""
    from app.models.surgical_block import SurgicalBlock
    from app.models.surgical_specimen import SurgicalSpecimen

    rows = (
        db.query(SurgicalBlock, SurgicalSpecimen.specimen_label)
        .join(SurgicalSpecimen, SurgicalBlock.specimen_id == SurgicalSpecimen.id)
        .filter(SurgicalSpecimen.case_id == case_id)
        .all()
    )
    rows.sort(key=lambda r: (label_sort_key(r[1]), r[0].block_no, r[0].id))
    for seq, (block, _label) in enumerate(rows, start=1):
        block.case_block_seq = seq


def lock_case(db: Session, case_id: int) -> None:
    """Row-lock the case, as accession numbering does, so two people changing
    blocks of one case at once cannot hand out the same letter."""
    from app.models.surgical_case import SurgicalCase

    db.query(SurgicalCase.id).filter(SurgicalCase.id == case_id).with_for_update().first()
