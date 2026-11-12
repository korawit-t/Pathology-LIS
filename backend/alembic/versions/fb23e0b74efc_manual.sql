-- Manual equivalent of Alembic revision fb23e0b74efc
-- "surgical label scheme" (specimen 1, 2, 3 / block A, B, C across the case)
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp fb23e0b74efc
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate column.
--
-- No backfill: existing blocks keep case_block_seq NULL (the A1 scheme) and
-- both settings default to the behaviour the system always had.

ALTER TABLE surgical_blocks ADD COLUMN IF NOT EXISTS case_block_seq INTEGER;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS surgical_label_scheme VARCHAR NOT NULL DEFAULT 'letter_number';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS surgical_block_delete_mode VARCHAR NOT NULL DEFAULT 'renumber';
