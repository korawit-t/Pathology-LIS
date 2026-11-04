-- Manual equivalent of Alembic revision b0fab3cb5651
-- "snapshot report logo path and gyne/nongyne header"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp b0fab3cb5651
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.
--
-- No backfill on purpose: NULL report_logo_path_snapshot marks a report signed
-- before this change, and its header keeps following current settings.

ALTER TABLE surgical_reports ADD COLUMN IF NOT EXISTS report_logo_path_snapshot VARCHAR;

ALTER TABLE gyne_cyto_reports ADD COLUMN IF NOT EXISTS lab_name_en_snapshot VARCHAR;
ALTER TABLE gyne_cyto_reports ADD COLUMN IF NOT EXISTS report_footer_snapshot TEXT;
ALTER TABLE gyne_cyto_reports ADD COLUMN IF NOT EXISTS report_logo_path_snapshot VARCHAR;

ALTER TABLE nongyne_cyto_reports ADD COLUMN IF NOT EXISTS lab_name_en_snapshot VARCHAR;
ALTER TABLE nongyne_cyto_reports ADD COLUMN IF NOT EXISTS report_footer_snapshot TEXT;
ALTER TABLE nongyne_cyto_reports ADD COLUMN IF NOT EXISTS report_logo_path_snapshot VARCHAR;
