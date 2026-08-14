-- Manual equivalent of Alembic revision 5f7b8f95552c
-- "add hosxp keyed flag to surgical block stains"
--
-- Apply this only if you are patching a production database directly instead
-- of running `alembic upgrade head`. Afterwards run:
--     alembic stamp 5f7b8f95552c
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) will try to
-- re-run this revision and crash on the duplicate column.

ALTER TABLE surgical_block_stains
    ADD COLUMN IF NOT EXISTS is_hosxp_keyed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE surgical_block_stains
    ADD COLUMN IF NOT EXISTS hosxp_keyed_at TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS ix_block_stains_unkeyed
    ON surgical_block_stains (id)
    WHERE is_hosxp_keyed = FALSE;
