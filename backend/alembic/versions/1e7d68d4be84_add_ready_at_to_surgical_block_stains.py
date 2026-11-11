"""add ready_at to surgical_block_stains

Revision ID: 1e7d68d4be84
Revises: 7d8a01fa225d
Create Date: 2026-11-11 11:30:39.312075

ready_at = when a slide became readable. From here on it is set wherever a
stain's status turns "stained" (outlab receive, in-house stain run created /
completed, PATCH), and cleared when it goes back to pending/sent — see
crud.surgical_block_stain.track_ready and crud.stain_run.

The backfill derives it the way the IHC TAT dashboard used to on every load:
the outlab receive time if the slide went out, else the in-house run's
completed time, else its start. Ready slides with neither (status set by hand)
stay NULL rather than get a made-up time.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1e7d68d4be84'
down_revision: Union[str, Sequence[str], None] = '7d8a01fa225d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Kept in sync with 1e7d68d4be84_manual.sql; run by tests/test_stain_ready_at.py.
BACKFILL_SQL = """
UPDATE surgical_block_stains s
   SET ready_at = r.ready
  FROM (
        SELECT s2.id,
               COALESCE(
                   (SELECT max(d.received_at)
                      FROM surgical_outlab_run_details d
                     WHERE d.stain_id = s2.id),
                   (SELECT max(COALESCE(sr.completed_at, sr.started_at))
                      FROM surgical_stain_run_details rd
                      JOIN surgical_stain_runs sr ON sr.id = rd.stain_run_id
                     WHERE rd.stain_id = s2.id)
               ) AS ready
          FROM surgical_block_stains s2
         WHERE s2.status IN ('stained', 'completed')
           AND s2.ready_at IS NULL
       ) r
 WHERE r.id = s.id
   AND r.ready IS NOT NULL
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('surgical_block_stains', sa.Column('ready_at', sa.DateTime(), nullable=True))
    op.execute(sa.text(BACKFILL_SQL))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('surgical_block_stains', 'ready_at')
