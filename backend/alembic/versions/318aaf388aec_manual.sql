-- Manual equivalent of Alembic revision 318aaf388aec
-- "cache latest consult round number on cases"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Requires 8f3638ca7ca8 (outlab_consult_requests)
-- first. Afterwards run:
--     alembic stamp 318aaf388aec
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.
--
-- Each case gets the consult_no of its latest non-cancelled round. The
-- UPDATEs skip rows already holding that value, so running twice changes nothing.

BEGIN;

ALTER TABLE surgical_cases ADD COLUMN IF NOT EXISTS consult_no VARCHAR;
ALTER TABLE gyne_cytology_cases ADD COLUMN IF NOT EXISTS consult_no VARCHAR;
ALTER TABLE nongyne_cytology_cases ADD COLUMN IF NOT EXISTS consult_no VARCHAR;

UPDATE surgical_cases c
   SET consult_no = latest.consult_no
  FROM (
        SELECT DISTINCT ON (case_id) case_id, consult_no
          FROM outlab_consult_requests
         WHERE case_type = 'surgical' AND status <> 'cancelled'
         ORDER BY case_id, seq DESC
       ) latest
 WHERE latest.case_id = c.id
   AND c.consult_no IS DISTINCT FROM latest.consult_no;

UPDATE gyne_cytology_cases c
   SET consult_no = latest.consult_no
  FROM (
        SELECT DISTINCT ON (case_id) case_id, consult_no
          FROM outlab_consult_requests
         WHERE case_type = 'gyne' AND status <> 'cancelled'
         ORDER BY case_id, seq DESC
       ) latest
 WHERE latest.case_id = c.id
   AND c.consult_no IS DISTINCT FROM latest.consult_no;

UPDATE nongyne_cytology_cases c
   SET consult_no = latest.consult_no
  FROM (
        SELECT DISTINCT ON (case_id) case_id, consult_no
          FROM outlab_consult_requests
         WHERE case_type = 'nongyne' AND status <> 'cancelled'
         ORDER BY case_id, seq DESC
       ) latest
 WHERE latest.case_id = c.id
   AND c.consult_no IS DISTINCT FROM latest.consult_no;

COMMIT;
