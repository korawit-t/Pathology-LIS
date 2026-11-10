-- Manual equivalent of Alembic revision 54bbe1c9fc1f
-- "add reported_at to surgical_block_stains"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp 54bbe1c9fc1f
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.
--
-- The UPDATE backfills reported_at for stains already signed out (rule in the
-- revision's docstring) and moves ready slides stuck at "stained" to
-- "completed". It only touches rows whose reported_at is still NULL, so
-- running it twice changes nothing.

ALTER TABLE surgical_block_stains ADD COLUMN IF NOT EXISTS reported_at TIMESTAMP;

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
 WHERE f.stain_id = s.id;
