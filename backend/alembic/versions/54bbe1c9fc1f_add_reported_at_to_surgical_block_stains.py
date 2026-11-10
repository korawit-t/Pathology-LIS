"""add reported_at to surgical_block_stains

Revision ID: 54bbe1c9fc1f
Revises: 54586a20758e
Create Date: 2026-11-10 23:24:25.427132

reported_at = when a stain's result went out: the pathologist's sign-off of
the report that carries it. From here on finalize_and_snapshot_orchestrator
stamps it (crud.surgical_block_stain.mark_case_stains_reported). This
revision backfills it for stains signed out before that existed, using the
same rule:

* the slide must have been ready to read before the report was signed —
  received back from the outlab, or its in-house stain run logged (completed,
  else started), else the order time;
* a report signed as complete counts every ready slide; a report signed as
  "No, Pending" (surgical_reports.is_pending snapshot) only counts slides
  already marked completed (IHC panel result / Mark Reviewed);
* the earliest such report wins.

Ready slides still at "stained" (results typed into the diagnosis text, never
entered in the IHC panel) also move to "completed", so they stop showing as
"awaiting review".

Known approximation: a slide marked completed after a pending report takes
that pending report's time.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '54bbe1c9fc1f'
down_revision: Union[str, Sequence[str], None] = '54586a20758e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Kept in sync with 54bbe1c9fc1f_manual.sql, and run directly by
# tests/test_stain_reported_at.py. The stain filter mirrors
# app/utils/stain_filters.is_not_he_base_test() plus the non-recut,
# non-Molecular conditions in mark_case_stains_reported.
BACKFILL_SQL = """
WITH candidate AS (
    SELECT s.id AS stain_id,
           sp.case_id,
           s.status,
           COALESCE(
               (SELECT max(d.received_at)
                  FROM surgical_outlab_run_details d
                 WHERE d.stain_id = s.id),
               (SELECT max(COALESCE(r.completed_at, r.started_at))
                  FROM surgical_stain_run_details rd
                  JOIN surgical_stain_runs r ON r.id = rd.stain_run_id
                 WHERE rd.stain_id = s.id),
               s.created_at
           ) AS ready_at
      FROM surgical_block_stains s
      JOIN surgical_blocks b ON b.id = s.block_id
      JOIN surgical_specimens sp ON sp.id = b.specimen_id
      JOIN anatomical_pathology_tests t ON t.id = s.test_id
     WHERE s.reported_at IS NULL
       AND s.status IN ('stained', 'completed')
       AND s.is_recut IS NOT TRUE
       AND (t.system_code IS NULL OR t.system_code NOT IN ('HE_ROUTINE', 'HE_RECUT'))
       AND t.name NOT ILIKE '%H&E%'
       AND lower(COALESCE(t.category, '')) <> 'molecular'
),
first_out AS (
    SELECT c.stain_id,
           min(COALESCE(rep.reported_at, rep.published_at)) AS out_at
      FROM candidate c
      JOIN surgical_reports rep ON rep.case_id = c.case_id
     WHERE rep.status IN ('published', 'pending')
       AND COALESCE(rep.reported_at, rep.published_at) >= c.ready_at
       AND (rep.is_pending IS NOT TRUE OR c.status = 'completed')
     GROUP BY c.stain_id
)
UPDATE surgical_block_stains s
   SET reported_at = f.out_at,
       status = 'completed'
  FROM first_out f
 WHERE f.stain_id = s.id
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('surgical_block_stains', sa.Column('reported_at', sa.DateTime(), nullable=True))
    # sa.text so the driver escapes the % in ILIKE.
    op.execute(sa.text(BACKFILL_SQL))


def downgrade() -> None:
    """Downgrade schema."""
    # Stains the backfill moved stained -> completed stay completed: there is
    # no record of which ones it touched once reported_at is gone.
    op.drop_column('surgical_block_stains', 'reported_at')
