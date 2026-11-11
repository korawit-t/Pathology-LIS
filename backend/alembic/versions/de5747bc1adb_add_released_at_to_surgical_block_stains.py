"""add released_at to surgical_block_stains

Revision ID: de5747bc1adb
Revises: 1e7d68d4be84
Create Date: 2026-11-11

released_at = when a stain's result reached the clinician: the publish of the
report whose sign-off stamped reported_at. With the approve system off that
is the sign-off itself; with it on, the approval
(crud.surgical_block_stain.mark_case_stains_released). A rejected sign-off
clears reported_at on stains not yet released (unmark_unreleased_stains).

Backfill: for each stain already reported, the earliest *published*
surgical_reports row on its case at or after reported_at — its published_at
(set by approval) or, for a report published straight on signing, its
reported_at. Stains whose report is still awaiting approval stay NULL: they
haven't gone out.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'de5747bc1adb'
down_revision: Union[str, Sequence[str], None] = '1e7d68d4be84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Kept in sync with de5747bc1adb_manual.sql; run by tests/test_stain_reported_at.py.
BACKFILL_SQL = """
UPDATE surgical_block_stains s
   SET released_at = r.released
  FROM (
        SELECT s2.id,
               min(COALESCE(rep.published_at, rep.reported_at)) AS released
          FROM surgical_block_stains s2
          JOIN surgical_blocks b ON b.id = s2.block_id
          JOIN surgical_specimens sp ON sp.id = b.specimen_id
          JOIN surgical_reports rep ON rep.case_id = sp.case_id
         WHERE s2.reported_at IS NOT NULL
           AND s2.released_at IS NULL
           AND rep.status = 'published'
           AND COALESCE(rep.published_at, rep.reported_at) >= s2.reported_at
         GROUP BY s2.id
       ) r
 WHERE r.id = s.id
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('surgical_block_stains', sa.Column('released_at', sa.DateTime(), nullable=True))
    op.execute(sa.text(BACKFILL_SQL))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('surgical_block_stains', 'released_at')
