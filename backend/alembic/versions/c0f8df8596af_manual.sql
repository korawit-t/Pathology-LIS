-- Manual equivalent of Alembic revision c0f8df8596af
-- "add review_requested_by_id to gyne_cytology_cases"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp c0f8df8596af
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.

ALTER TABLE gyne_cytology_cases ADD COLUMN IF NOT EXISTS review_requested_by_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'gyne_cytology_cases_review_requested_by_id_fkey'
    ) THEN
        ALTER TABLE gyne_cytology_cases
            ADD CONSTRAINT gyne_cytology_cases_review_requested_by_id_fkey
            FOREIGN KEY (review_requested_by_id) REFERENCES users (id);
    END IF;
END $$;
