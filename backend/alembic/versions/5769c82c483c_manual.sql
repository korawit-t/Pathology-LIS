-- Manual equivalent of Alembic revision 5769c82c483c
-- "slide dispatch item slide count"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp 5769c82c483c
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.
--
-- No backfill on purpose: slide_count is a snapshot taken when a case is
-- dispatched, and today's stain count for an old dispatch would include
-- special stains / IHC ordered after it was sent. NULL marks a note dispatched
-- before this change; it prints "-" for its slide counts.

ALTER TABLE slide_dispatch_items ADD COLUMN IF NOT EXISTS slide_count INTEGER;
