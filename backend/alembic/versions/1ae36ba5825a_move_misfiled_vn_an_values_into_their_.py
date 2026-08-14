"""move misfiled vn/an values into their correct columns

Revision ID: 1ae36ba5825a
Revises: 5f7b8f95552c
Create Date: 2026-08-14

Data repair for the inverted VN/AN split in HOSxPAdapter._map_row. Every case
imported from HOSxP had its visit/admission number filed under the wrong
column, which drove _build_barcode_value to stamp the wrong OPD/IPD prefix on
the barcode.

Classification is by length, the same signal the adapter uses, confirmed three
independent ways against the live data:

  * HOSxP source tables — vn_stat.vn is 12 digits (5,124,506 rows),
    an_stat.an is 9 (331,364). No other lengths exist.
  * Shape — of the 9-digit values, 534/537 begin with the current Buddhist
    year (69); the 12-digit values all parse as a valid BE YYMMDD date.
  * Chronology — every one of those 12-digit dates falls on or before its
    case's registration date, and within 30 days of it. That is a visit date
    preceding lab registration; an admission number would not behave that way.

Production state when this was written (surgical_cases, 624 rows):
    86 rows  12-digit VN sitting in `an`
   537 rows   9-digit AN sitting in `vn`
     2 rows  both columns populated, both wrong — a genuine swap
     1 row   already correct (repaired by hand); untouched by design

nongyne_cytology_cases and molecular_cases have no vn/an data at all, but are
included so the repair holds if they start importing later.

NOT a blanket `an <-> vn` swap: that would invert rows that are already right,
including hand-repaired ones. Each column is set from whichever source value
has the matching shape, and left alone when neither rule applies — so the
statement is idempotent and safe to re-run.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "1ae36ba5825a"
down_revision: Union[str, Sequence[str], None] = "5f7b8f95552c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("surgical_cases", "nongyne_cytology_cases", "molecular_cases")

# One statement per table so both assignments read the ORIGINAL row: a
# sequential pair would move a value into `vn` and then move it straight back.
# The ELSE arms are what make already-correct rows survive untouched — an
# unconditional CASE that fell through to NULL would blank them.
_MOVE = """
UPDATE {table}
SET an = CASE
           WHEN length(vn) BETWEEN 1 AND 9 THEN vn   -- an AN found in `vn`
           WHEN length(an) > 9             THEN NULL -- `an` held a VN, moving out
           ELSE an
         END,
    vn = CASE
           WHEN length(an) > 9             THEN an   -- a VN found in `an`
           WHEN length(vn) BETWEEN 1 AND 9 THEN NULL -- `vn` held an AN, moving out
           ELSE vn
         END
WHERE length(an) > 9 OR length(vn) BETWEEN 1 AND 9
"""

def upgrade() -> None:
    conn = op.get_bind()
    for table in _TABLES:
        res = conn.execute(sa.text(_MOVE.format(table=table)))  # nosec B608 — table name from a module-level literal tuple
        print(f"[{table}] moved {res.rowcount} row(s)")


def downgrade() -> None:
    """Intentionally a no-op.

    A mirrored move cannot be written safely: once upgrade() has run, a row
    that is correct because it was repaired is indistinguishable from one that
    was correct all along, so the reverse rule re-breaks the latter. That was
    not theoretical — an early draft of this revision did exactly that, and the
    round-trip test caught it putting hand-repaired rows back the wrong way.

    Nor is reversing wanted. Rolling the code back re-inverts the *adapter*, so
    new imports are misfiled again, but _build_barcode_value only branches on
    which column is populated — repaired rows keep producing the right prefix
    under the old code too. Leaving the data correct is strictly better than
    corrupting it to match a previous release.
    """

