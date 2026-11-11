-- Manual equivalent of Alembic revision de5747bc1adb
-- "add released_at to surgical_block_stains"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp de5747bc1adb
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.
--
-- Backfill: the first published report on the case at or after the stain's
-- reported_at (its approval time, or its sign time if published on signing).
-- Only rows still NULL are touched, so running it twice changes nothing.

ALTER TABLE surgical_block_stains ADD COLUMN IF NOT EXISTS released_at TIMESTAMP;

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
 WHERE r.id = s.id;
