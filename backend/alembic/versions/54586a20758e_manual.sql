-- Manual equivalent of Alembic revision 54586a20758e
-- "legacy report import batches and profiles"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp 54586a20758e
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate table.

CREATE TABLE IF NOT EXISTS legacy_import_batches (
    id SERIAL PRIMARY KEY,
    report_type VARCHAR NOT NULL,
    source_system VARCHAR NOT NULL,
    file_name VARCHAR,
    file_sha256 VARCHAR(64),
    mapping JSON NOT NULL,
    total_rows INTEGER NOT NULL,
    inserted_count INTEGER NOT NULL,
    updated_count INTEGER NOT NULL,
    skipped_count INTEGER NOT NULL,
    error_count INTEGER NOT NULL,
    status VARCHAR NOT NULL,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    rolled_back_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rolled_back_at TIMESTAMP WITHOUT TIME ZONE,
    rolled_back_count INTEGER
);
CREATE INDEX IF NOT EXISTS ix_legacy_import_batches_id ON legacy_import_batches (id);
CREATE INDEX IF NOT EXISTS ix_legacy_import_batches_file_sha256 ON legacy_import_batches (file_sha256);

CREATE TABLE IF NOT EXISTS legacy_import_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE,
    report_type VARCHAR NOT NULL,
    mapping JSON NOT NULL,
    created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_legacy_import_profiles_id ON legacy_import_profiles (id);

-- The same three columns, index, unique pair and foreign key on each legacy table.
ALTER TABLE legacy_surgical_reports ADD COLUMN IF NOT EXISTS source_system VARCHAR;
ALTER TABLE legacy_surgical_reports ADD COLUMN IF NOT EXISTS source_ref VARCHAR;
ALTER TABLE legacy_surgical_reports ADD COLUMN IF NOT EXISTS import_batch_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_legacy_surgical_reports_import_batch_id ON legacy_surgical_reports (import_batch_id);

ALTER TABLE legacy_gyne_cyto_reports ADD COLUMN IF NOT EXISTS source_system VARCHAR;
ALTER TABLE legacy_gyne_cyto_reports ADD COLUMN IF NOT EXISTS source_ref VARCHAR;
ALTER TABLE legacy_gyne_cyto_reports ADD COLUMN IF NOT EXISTS import_batch_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_legacy_gyne_cyto_reports_import_batch_id ON legacy_gyne_cyto_reports (import_batch_id);

ALTER TABLE legacy_nongyne_cyto_reports ADD COLUMN IF NOT EXISTS source_system VARCHAR;
ALTER TABLE legacy_nongyne_cyto_reports ADD COLUMN IF NOT EXISTS source_ref VARCHAR;
ALTER TABLE legacy_nongyne_cyto_reports ADD COLUMN IF NOT EXISTS import_batch_id INTEGER;
CREATE INDEX IF NOT EXISTS ix_legacy_nongyne_cyto_reports_import_batch_id ON legacy_nongyne_cyto_reports (import_batch_id);

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS, hence the guard blocks.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_legacy_surgical_reports_source') THEN
        ALTER TABLE legacy_surgical_reports
            ADD CONSTRAINT uq_legacy_surgical_reports_source UNIQUE (source_system, source_ref);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_legacy_surgical_reports_import_batch_id') THEN
        ALTER TABLE legacy_surgical_reports
            ADD CONSTRAINT fk_legacy_surgical_reports_import_batch_id
            FOREIGN KEY (import_batch_id) REFERENCES legacy_import_batches(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_legacy_gyne_cyto_reports_source') THEN
        ALTER TABLE legacy_gyne_cyto_reports
            ADD CONSTRAINT uq_legacy_gyne_cyto_reports_source UNIQUE (source_system, source_ref);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_legacy_gyne_cyto_reports_import_batch_id') THEN
        ALTER TABLE legacy_gyne_cyto_reports
            ADD CONSTRAINT fk_legacy_gyne_cyto_reports_import_batch_id
            FOREIGN KEY (import_batch_id) REFERENCES legacy_import_batches(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_legacy_nongyne_cyto_reports_source') THEN
        ALTER TABLE legacy_nongyne_cyto_reports
            ADD CONSTRAINT uq_legacy_nongyne_cyto_reports_source UNIQUE (source_system, source_ref);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_legacy_nongyne_cyto_reports_import_batch_id') THEN
        ALTER TABLE legacy_nongyne_cyto_reports
            ADD CONSTRAINT fk_legacy_nongyne_cyto_reports_import_batch_id
            FOREIGN KEY (import_batch_id) REFERENCES legacy_import_batches(id) ON DELETE SET NULL;
    END IF;
END $$;
