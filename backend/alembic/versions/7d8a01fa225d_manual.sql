-- Manual equivalent of Alembic revision 7d8a01fa225d
-- "add ihc_tat_days to system_settings"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp 7d8a01fa225d
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.
--
-- Target working days from IHC order to the sign-off that carries the result
-- (Admin → Workflow → Turnaround Time). The default fills the existing row.

ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS ihc_tat_days INTEGER DEFAULT 10;
