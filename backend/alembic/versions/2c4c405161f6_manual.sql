-- Manual equivalent of Alembic revision 2c4c405161f6
-- "add cyto_path_correlations and enable_cyto_path_qc"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp 2c4c405161f6
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the duplicate table.

CREATE TABLE IF NOT EXISTS cyto_path_correlations (
    id                   SERIAL PRIMARY KEY,
    case_type            VARCHAR(10) NOT NULL,
    gyne_case_id         INTEGER REFERENCES gyne_cytology_cases(id),
    nongyne_case_id      INTEGER REFERENCES nongyne_cytology_cases(id),
    accession_no         VARCHAR,
    cytotechnologist_id  INTEGER REFERENCES users(id),
    screening_diagnosis  TEXT,
    screening_summary    TEXT,
    screening_flags      JSON,
    screened_at          TIMESTAMP,
    pathologist_id       INTEGER REFERENCES users(id),
    final_diagnosis      TEXT,
    final_summary        TEXT,
    final_flags          JSON,
    signed_out_at        TIMESTAMP,
    version_no           INTEGER,
    auto_result          VARCHAR(20),
    result               VARCHAR(30),
    status               VARCHAR(20) NOT NULL,
    discrepancy_category VARCHAR(40),
    comment              TEXT,
    reviewed_by_id       INTEGER REFERENCES users(id),
    reviewed_at          TIMESTAMP,
    created_at           TIMESTAMP DEFAULT now(),
    updated_at           TIMESTAMP DEFAULT now(),
    CONSTRAINT uq_cyto_path_corr_case UNIQUE (case_type, gyne_case_id, nongyne_case_id)
);

CREATE INDEX IF NOT EXISTS ix_cyto_path_correlations_id                  ON cyto_path_correlations (id);
CREATE INDEX IF NOT EXISTS ix_cyto_path_correlations_case_type           ON cyto_path_correlations (case_type);
CREATE INDEX IF NOT EXISTS ix_cyto_path_correlations_gyne_case_id        ON cyto_path_correlations (gyne_case_id);
CREATE INDEX IF NOT EXISTS ix_cyto_path_correlations_nongyne_case_id     ON cyto_path_correlations (nongyne_case_id);
CREATE INDEX IF NOT EXISTS ix_cyto_path_correlations_accession_no        ON cyto_path_correlations (accession_no);
CREATE INDEX IF NOT EXISTS ix_cyto_path_correlations_cytotechnologist_id ON cyto_path_correlations (cytotechnologist_id);
CREATE INDEX IF NOT EXISTS ix_cyto_path_correlations_pathologist_id      ON cyto_path_correlations (pathologist_id);
CREATE INDEX IF NOT EXISTS ix_cyto_path_correlations_signed_out_at       ON cyto_path_correlations (signed_out_at);
CREATE INDEX IF NOT EXISTS ix_cyto_path_correlations_status              ON cyto_path_correlations (status);

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS enable_cyto_path_qc BOOLEAN NOT NULL DEFAULT false;
