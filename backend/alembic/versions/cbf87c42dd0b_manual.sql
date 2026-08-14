-- Manual equivalent of Alembic revision cbf87c42dd0b
-- "add vn and an to gyne cytology cases"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp cbf87c42dd0b
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.

ALTER TABLE gyne_cytology_cases ADD COLUMN IF NOT EXISTS an VARCHAR;
ALTER TABLE gyne_cytology_cases ADD COLUMN IF NOT EXISTS vn VARCHAR;
