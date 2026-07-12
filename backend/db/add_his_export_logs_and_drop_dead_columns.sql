-- Adds the his_export_logs outbox/delivery-log table for outbound HIS report
-- export, and drops the his_sent_at/his_send_error/his_reference_id/
-- his_send_retries columns from surgical_reports/gyne_cyto_reports/
-- nongyne_cyto_reports (added in migration 57c0f86f4eb6, never wired to any
-- code — the new table replaces them).
--
-- Equivalent to Alembic revision 505669ae3ee1. After applying this manually,
-- run `alembic stamp head` (or `alembic stamp 505669ae3ee1`) so the next
-- `alembic upgrade head` does not try to re-run it.

BEGIN;

CREATE TABLE IF NOT EXISTS his_export_logs (
    id SERIAL PRIMARY KEY,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INTEGER NOT NULL,
    accession_no VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    adapter_type VARCHAR(50),
    payload_snapshot JSON,
    response_snapshot JSON,
    error_message TEXT,
    his_reference_id VARCHAR,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 8,
    next_attempt_at TIMESTAMP,
    claimed_at TIMESTAMP,
    sent_at TIMESTAMP,
    triggered_by VARCHAR(20) NOT NULL DEFAULT 'auto',
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_his_export_logs_status_next_attempt
    ON his_export_logs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS ix_his_export_logs_resource
    ON his_export_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS ix_his_export_logs_accession_no
    ON his_export_logs (accession_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_his_export_logs_active_resource
    ON his_export_logs (resource_type, resource_id)
    WHERE status IN ('pending', 'processing');

-- --- Drop dead his_send_* tracking columns (never wired to any code) ---
DROP INDEX IF EXISTS idx_surgical_reports_his_sent_at;
ALTER TABLE surgical_reports
    DROP COLUMN IF EXISTS his_send_retries,
    DROP COLUMN IF EXISTS his_reference_id,
    DROP COLUMN IF EXISTS his_send_error,
    DROP COLUMN IF EXISTS his_sent_at;

DROP INDEX IF EXISTS idx_gyne_cyto_reports_his_sent_at;
ALTER TABLE gyne_cyto_reports
    DROP COLUMN IF EXISTS his_send_retries,
    DROP COLUMN IF EXISTS his_reference_id,
    DROP COLUMN IF EXISTS his_send_error,
    DROP COLUMN IF EXISTS his_sent_at;

DROP INDEX IF EXISTS idx_nongyne_cyto_reports_his_sent_at;
ALTER TABLE nongyne_cyto_reports
    DROP COLUMN IF EXISTS his_send_retries,
    DROP COLUMN IF EXISTS his_reference_id,
    DROP COLUMN IF EXISTS his_send_error,
    DROP COLUMN IF EXISTS his_sent_at;

COMMIT;
