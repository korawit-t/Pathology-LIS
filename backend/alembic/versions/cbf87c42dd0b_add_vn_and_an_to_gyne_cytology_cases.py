"""add vn and an to gyne cytology cases

Revision ID: cbf87c42dd0b
Revises: 1ae36ba5825a
Create Date: 2026-08-14

gyne_cytology_cases carried only `hn`, unlike surgical_cases and
nongyne_cytology_cases which both have `vn` and `an`. That is why the gyne
label barcode keyed off the HN while the other two used the visit/admission
number with an OPD/IPD prefix — it had nowhere else to read from.

Both columns are nullable with no backfill: existing gyne cases keep NULL and
gyne_cyto_report.py falls back to the previous HN-based barcode for them, so
nothing already registered changes. New cases pick the values up from the
HOSxP import.

Written by hand rather than --autogenerate: on this schema autogenerate also
sweeps in unrelated drift (notification-rule column comments, a constraint
rename) and tries to DROP partial indexes it cannot introspect.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "cbf87c42dd0b"
down_revision: Union[str, Sequence[str], None] = "1ae36ba5825a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("gyne_cytology_cases", sa.Column("an", sa.String(), nullable=True))
    op.add_column("gyne_cytology_cases", sa.Column("vn", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("gyne_cytology_cases", "vn")
    op.drop_column("gyne_cytology_cases", "an")
