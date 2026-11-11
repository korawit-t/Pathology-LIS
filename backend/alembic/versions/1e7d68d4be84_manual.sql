-- Manual equivalent of Alembic revision 1e7d68d4be84
-- "add ready_at to surgical_block_stains"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp 1e7d68d4be84
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.
--
-- Backfill: outlab receive time, else in-house run completed, else started.
-- Only rows still NULL are touched, so running it twice changes nothing.

ALTER TABLE surgical_block_stains ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP;

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
   AND r.ready IS NOT NULL;
