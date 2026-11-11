"""add result timeline to nongyne_cyto_stains

Revision ID: 4ce1135497ee
Revises: de5747bc1adb
Create Date: 2026-11-11

Non-gyne IHC / special stains get the same three stamps as surgical
(app/crud/stain_signoff.py): ready_at, reported_at (the pathologist's
sign-off that carried the result) and released_at (its report published).

Backfill, in order:
1. ready_at — the stain run's completed time, else its start. Non-gyne runs
   are saved already completed, so this is the run time.
2. reported_at — for IHC / special stains already ready: the first signed
   non-gyne report (published or awaiting approval) at or after the slide was
   ready (ready_at, else its order time). A report signed as provisional
   (is_pending) only counts slides already completed (panel result). Ready
   slides stuck at "stained" move to "completed".
3. released_at — the first published report at or after reported_at.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ce1135497ee'
down_revision: Union[str, Sequence[str], None] = 'de5747bc1adb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Run in this order. Kept in sync with 4ce1135497ee_manual.sql; run by
# tests/test_nongyne_stain_timeline.py.
BACKFILL_SQL = (
    # 1. ready_at
    """
    UPDATE nongyne_cyto_stains s
       SET ready_at = r.ready
      FROM (
            SELECT s2.id,
                   (SELECT max(COALESCE(nr.completed_at, nr.started_at))
                      FROM nongyne_stain_run_details rd
                      JOIN nongyne_stain_runs nr ON nr.id = rd.stain_run_id
                     WHERE rd.stain_id = s2.id) AS ready
              FROM nongyne_cyto_stains s2
             WHERE s2.status IN ('stained', 'completed')
               AND s2.ready_at IS NULL
           ) r
     WHERE r.id = s.id
       AND r.ready IS NOT NULL
    """,
    # 2. reported_at (and stuck "stained" -> "completed")
    """
    WITH candidate AS (
        SELECT s.id AS stain_id,
               s.case_id,
               s.status,
               COALESCE(s.ready_at, s.created_at) AS ready_at
          FROM nongyne_cyto_stains s
          JOIN anatomical_pathology_tests t ON t.id = s.test_id
         WHERE s.reported_at IS NULL
           AND s.status IN ('stained', 'completed')
           AND lower(t.category) IN ('ihc', 'histochem', 'special stain')
    ),
    first_out AS (
        SELECT c.stain_id,
               min(rep.reported_at) AS out_at
          FROM candidate c
          JOIN nongyne_cyto_reports rep ON rep.case_id = c.case_id
         WHERE rep.status IN ('published', 'pending')
           AND rep.reported_at >= c.ready_at
           AND (rep.is_pending IS NOT TRUE OR c.status = 'completed')
         GROUP BY c.stain_id
    )
    UPDATE nongyne_cyto_stains s
       SET reported_at = f.out_at,
           status = 'completed'
      FROM first_out f
     WHERE f.stain_id = s.id
    """,
    # 3. released_at
    """
    UPDATE nongyne_cyto_stains s
       SET released_at = r.released
      FROM (
            SELECT s2.id,
                   min(COALESCE(rep.published_at, rep.reported_at)) AS released
              FROM nongyne_cyto_stains s2
              JOIN nongyne_cyto_reports rep ON rep.case_id = s2.case_id
             WHERE s2.reported_at IS NOT NULL
               AND s2.released_at IS NULL
               AND rep.status = 'published'
               AND COALESCE(rep.published_at, rep.reported_at) >= s2.reported_at
             GROUP BY s2.id
           ) r
     WHERE r.id = s.id
    """,
)


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('nongyne_cyto_stains', sa.Column('ready_at', sa.DateTime(), nullable=True))
    op.add_column('nongyne_cyto_stains', sa.Column('reported_at', sa.DateTime(), nullable=True))
    op.add_column('nongyne_cyto_stains', sa.Column('released_at', sa.DateTime(), nullable=True))
    for statement in BACKFILL_SQL:
        op.execute(sa.text(statement))


def downgrade() -> None:
    """Downgrade schema."""
    # Slides the backfill moved stained -> completed stay completed.
    op.drop_column('nongyne_cyto_stains', 'released_at')
    op.drop_column('nongyne_cyto_stains', 'reported_at')
    op.drop_column('nongyne_cyto_stains', 'ready_at')
