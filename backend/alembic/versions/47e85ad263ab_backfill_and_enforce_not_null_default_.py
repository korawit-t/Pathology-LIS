"""backfill and enforce not-null default for is_cancelled

Revision ID: 47e85ad263ab
Revises: c0ead2540ccf
Create Date: 2026-07-02 16:01:14.179429

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '47e85ad263ab'
down_revision: Union[str, Sequence[str], None] = 'c0ead2540ccf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Backfill rows left NULL by the earlier manual ADD COLUMN (no DB-level default) — must
    # happen before SET NOT NULL, or the constraint fails on any row still NULL.
    op.execute("UPDATE gyne_cytology_cases SET is_cancelled = false WHERE is_cancelled IS NULL")
    op.execute("UPDATE nongyne_cytology_cases SET is_cancelled = false WHERE is_cancelled IS NULL")
    op.alter_column('gyne_cytology_cases', 'is_cancelled',
               existing_type=sa.BOOLEAN(),
               nullable=False,
               server_default=sa.text('false'))
    op.alter_column('nongyne_cytology_cases', 'is_cancelled',
               existing_type=sa.BOOLEAN(),
               nullable=False,
               server_default=sa.text('false'))


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('nongyne_cytology_cases', 'is_cancelled',
               existing_type=sa.BOOLEAN(),
               nullable=True,
               server_default=None)
    op.alter_column('gyne_cytology_cases', 'is_cancelled',
               existing_type=sa.BOOLEAN(),
               nullable=True,
               server_default=None)
