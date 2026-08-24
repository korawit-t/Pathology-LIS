-- Adds the two tables behind the specimen disposal checklist: one row per
-- printed sheet (specimen_disposal_batches) and one row per case listed on
-- it (specimen_disposal_batch_items).
--
-- The sheet is printed first (status = PRINTED), carried to the storage room,
-- ticked off and signed by ผู้ทิ้ง / ผู้ตรวจสอบ / ผู้อนุมัติ, then confirmed in the
-- app (status = DISPOSED). Signer names are snapshotted alongside the FKs so a
-- later profile edit cannot change what an already-printed sheet says.
--
-- Equivalent to Alembic revision 0681b9ac2cac. After applying this manually,
-- run `alembic stamp head` so the next `alembic upgrade head` does not try
-- to re-run it.

BEGIN;

CREATE TABLE IF NOT EXISTS specimen_disposal_batches (
    id SERIAL PRIMARY KEY,
    batch_no VARCHAR(20) NOT NULL,
    retention_days INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'PRINTED',
    disposal_method VARCHAR(200),
    remark TEXT,
    printed_by_id INTEGER REFERENCES users(id),
    printed_at TIMESTAMP NOT NULL DEFAULT now(),
    disposer_id INTEGER REFERENCES users(id),
    verifier_id INTEGER REFERENCES users(id),
    approver_id INTEGER REFERENCES users(id),
    disposer_name VARCHAR(200),
    verifier_name VARCHAR(200),
    approver_name VARCHAR(200),
    disposed_at TIMESTAMP,
    disposed_by_id INTEGER REFERENCES users(id),
    cancelled_at TIMESTAMP,
    cancelled_by_id INTEGER REFERENCES users(id),
    cancel_reason TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_specimen_disposal_batches_batch_no
    ON specimen_disposal_batches (batch_no);
CREATE INDEX IF NOT EXISTS ix_specimen_disposal_batches_id
    ON specimen_disposal_batches (id);

CREATE TABLE IF NOT EXISTS specimen_disposal_batch_items (
    id SERIAL PRIMARY KEY,
    batch_id INTEGER NOT NULL
        REFERENCES specimen_disposal_batches(id) ON DELETE CASCADE,
    case_id INTEGER NOT NULL REFERENCES surgical_cases(id),
    container_snapshot VARCHAR,
    CONSTRAINT uq_disposal_batch_case UNIQUE (batch_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_disposal_item_case
    ON specimen_disposal_batch_items (case_id);
CREATE INDEX IF NOT EXISTS ix_specimen_disposal_batch_items_id
    ON specimen_disposal_batch_items (id);

COMMIT;
