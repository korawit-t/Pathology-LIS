-- Manual equivalent of Alembic revision 96a7ae501bf4
-- "add update notice switches to system_settings"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp 96a7ae501bf4
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.

ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS notify_new_release BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS notify_new_build BOOLEAN NOT NULL DEFAULT true;
