"""drop unused accession_no_format from system setting

Revision ID: dropaccfmt01
Revises: cumsort001
Create Date: 2026-07-13

Removed because it was never read anywhere — accession number generation
for surgical/gyne/nongyne always hardcodes f"{letter}{year}-{no}" and never
consulted this field.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "dropaccfmt01"
down_revision: Union[str, None] = "cumsort001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS accession_no_format")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS accession_no_format VARCHAR DEFAULT '{year}-{no}'"
    )
