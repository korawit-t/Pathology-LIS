-- Manual equivalent of Alembic revision 4ce1135497ee
-- "add result timeline to nongyne_cyto_stains"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp 4ce1135497ee
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.
--
-- Backfill rule in the revision's docstring. Each UPDATE only touches rows
-- still NULL, so running the file twice changes nothing.

ALTER TABLE nongyne_cyto_stains ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP;
ALTER TABLE nongyne_cyto_stains ADD COLUMN IF NOT EXISTS reported_at TIMESTAMP;
ALTER TABLE nongyne_cyto_stains ADD COLUMN IF NOT EXISTS released_at TIMESTAMP;

-- 1. ready_at
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
   AND r.ready IS NOT NULL;

-- 2. reported_at (and stuck "stained" -> "completed")
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
 WHERE f.stain_id = s.id;

-- 3. released_at
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
 WHERE r.id = s.id;
