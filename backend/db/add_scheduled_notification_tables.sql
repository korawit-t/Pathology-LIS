-- Adds scheduled_notification_rules (time-based notification rules, checked
-- periodically by the scheduled_notifications background worker) and
-- scheduled_notification_states (dedup ledger keyed by rule_id + target_key,
-- so a still-breaching target is only notified once, not every poll cycle).
--
-- Equivalent to Alembic revision 8aa0840a8dea. After applying this manually,
-- run `alembic stamp head` (or `alembic stamp 8aa0840a8dea`) so the next
-- `alembic upgrade head` does not try to re-run it.
--
-- Depends on revision 773da4e8976c (adds system_settings.scheduled_notification_poll_seconds
-- via a plain `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` inline in that migration —
-- no companion .sql file needed for a single column add, per this repo's convention).

BEGIN;

CREATE TABLE IF NOT EXISTS scheduled_notification_rules (
    id SERIAL PRIMARY KEY,
    rule_type VARCHAR NOT NULL,
    label VARCHAR,
    threshold_value INTEGER NOT NULL DEFAULT 2,
    threshold_unit VARCHAR NOT NULL DEFAULT 'hours',
    channel_ids JSON,
    message_template TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT now() NOT NULL,
    updated_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_scheduled_notification_rules_rule_type
    ON scheduled_notification_rules (rule_type);

CREATE TABLE IF NOT EXISTS scheduled_notification_states (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER NOT NULL REFERENCES scheduled_notification_rules(id) ON DELETE CASCADE,
    target_key VARCHAR(150) NOT NULL,
    first_detected_at TIMESTAMP NOT NULL,
    last_notified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_scheduled_notification_states_rule_id
    ON scheduled_notification_states (rule_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduled_notification_states_target
    ON scheduled_notification_states (rule_id, target_key);

COMMIT;
