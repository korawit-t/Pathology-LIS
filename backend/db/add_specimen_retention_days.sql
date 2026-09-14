-- Adds the surgical specimen retention rule: how many days after report_at a
-- specimen must be kept before it may go on a disposal checklist.
--
-- Enforced server-side in app/crud/specimen_disposal_batch.create_batch, not
-- merely printed on the sheet — before this column the criterion came from the
-- request body, so any caller could send 0 and dispose of a case reported
-- yesterday. Mirrors nongyne_specimen_retention_days.
--
-- 30 matches the non-gyne default; set the lab's real figure in
-- Settings -> Report after applying.
--
-- Equivalent to Alembic revision bbf647206034. After applying this manually,
-- run `alembic stamp head` so the next `alembic upgrade head` does not try
-- to re-run it.

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS specimen_retention_days INTEGER NOT NULL DEFAULT 30;
