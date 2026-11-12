-- Manual equivalent of Alembic revision 8f3638ca7ca8
-- "outlab consult requests one row per consult round"
--
-- Apply only if patching a production database directly instead of running
-- `alembic upgrade head`. Afterwards run:
--     alembic stamp 8f3638ca7ca8
-- otherwise the next auto-upgrade (Railway deploy / start.ps1) re-runs this
-- revision and crashes on the existing table.
--
-- Backfill rule in the revision's docstring: every case flagged or dispatched
-- gets round 1 (S26-01234-C1) with its status mapped from the case columns,
-- and run lines are linked to it. Every statement is guarded (IF NOT EXISTS /
-- NOT EXISTS / consult_id IS NULL), so running the file twice changes nothing.

BEGIN;

CREATE TABLE IF NOT EXISTS outlab_consult_requests (
    id SERIAL NOT NULL, 
    case_type VARCHAR NOT NULL, 
    case_id INTEGER NOT NULL, 
    seq INTEGER NOT NULL, 
    consult_no VARCHAR NOT NULL, 
    status VARCHAR NOT NULL, 
    reason TEXT, 
    destination_lab VARCHAR, 
    requested_by_id INTEGER, 
    requested_at TIMESTAMP WITHOUT TIME ZONE, 
    result_pdf_path VARCHAR, 
    result_received_at TIMESTAMP WITHOUT TIME ZONE, 
    result_uploaded_by_id INTEGER, 
    external_ref VARCHAR, 
    external_pathologist VARCHAR, 
    concordance VARCHAR, 
    approved_by_id INTEGER, 
    approved_at TIMESTAMP WITHOUT TIME ZONE, 
    pdf_thumbnails TEXT, 
    reported_in_report_id INTEGER, 
    reported_at TIMESTAMP WITHOUT TIME ZONE, 
    cancelled_at TIMESTAMP WITHOUT TIME ZONE, 
    cancelled_by_id INTEGER, 
    cancel_reason TEXT, 
    created_at TIMESTAMP WITHOUT TIME ZONE, 
    updated_at TIMESTAMP WITHOUT TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(approved_by_id) REFERENCES users (id), 
    FOREIGN KEY(cancelled_by_id) REFERENCES users (id), 
    FOREIGN KEY(requested_by_id) REFERENCES users (id), 
    FOREIGN KEY(result_uploaded_by_id) REFERENCES users (id), 
    CONSTRAINT uq_outlab_consult_requests_case_seq UNIQUE (case_type, case_id, seq)
);

CREATE INDEX IF NOT EXISTS ix_outlab_consult_requests_case ON outlab_consult_requests (case_type, case_id);

CREATE INDEX IF NOT EXISTS ix_outlab_consult_requests_consult_no ON outlab_consult_requests (consult_no);

CREATE INDEX IF NOT EXISTS ix_outlab_consult_requests_id ON outlab_consult_requests (id);

CREATE INDEX IF NOT EXISTS ix_outlab_consult_requests_status ON outlab_consult_requests (status);

ALTER TABLE gyne_cyto_reports ADD COLUMN IF NOT EXISTS consult_ids_snapshot JSON;

ALTER TABLE nongyne_cyto_reports ADD COLUMN IF NOT EXISTS consult_ids_snapshot JSON;

ALTER TABLE outlab_consult_run_details ADD COLUMN IF NOT EXISTS consult_id INTEGER;

CREATE INDEX IF NOT EXISTS ix_outlab_consult_run_details_consult_id ON outlab_consult_run_details (consult_id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_outlab_consult_run_details_consult_id') THEN
        ALTER TABLE outlab_consult_run_details ADD CONSTRAINT fk_outlab_consult_run_details_consult_id
            FOREIGN KEY (consult_id) REFERENCES outlab_consult_requests (id) ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE surgical_reports ADD COLUMN IF NOT EXISTS consult_ids_snapshot JSON;

INSERT INTO outlab_consult_requests (
            case_type, case_id, seq, consult_no, status, reason, destination_lab,
            result_pdf_path, result_received_at, approved_by_id, approved_at,
            created_at, updated_at
        )
        SELECT
            'surgical', c.id, 1,
            COALESCE(c.accession_no, 'CASE' || c.id) || '-C1',
            CASE
                WHEN c.consult_status = 'received' THEN 'reported'
                WHEN c.consult_status = 'processing' AND c.consult_pdf_path IS NOT NULL
                     AND c.consult_pdf_approved_by_id IS NOT NULL THEN 'approved'
                WHEN c.consult_status = 'processing' AND c.consult_pdf_path IS NOT NULL THEN 'result_received'
                WHEN c.consult_status = 'processing' THEN 'sent'
                WHEN c.consult_pdf_path IS NOT NULL THEN 'result_received'
                ELSE 'requested'
            END,
            c.consult_reason,
            (
                SELECT r.destination_lab
                FROM outlab_consult_run_details d
                JOIN outlab_consult_runs r ON r.id = d.run_id
                WHERE d.case_type = 'surgical' AND d.case_id = c.id
                ORDER BY d.id DESC
                LIMIT 1
            ),
            c.consult_pdf_path, c.consult_pdf_received_at, c.consult_pdf_approved_by_id, c.consult_pdf_approved_at,
            now(), now()
        FROM surgical_cases c
        WHERE (c.is_out_lab_consult IS TRUE OR c.consult_status IN ('processing', 'received'))
          AND NOT EXISTS (
              SELECT 1 FROM outlab_consult_requests q
              WHERE q.case_type = 'surgical' AND q.case_id = c.id
          );

        UPDATE surgical_cases c
        SET is_out_lab_consult = TRUE
        WHERE c.is_out_lab_consult IS NOT TRUE
          AND EXISTS (
              SELECT 1 FROM outlab_consult_requests q
              WHERE q.case_type = 'surgical' AND q.case_id = c.id
          );

INSERT INTO outlab_consult_requests (
            case_type, case_id, seq, consult_no, status, reason, destination_lab,
            result_pdf_path, result_received_at, approved_by_id, approved_at,
            created_at, updated_at
        )
        SELECT
            'gyne', c.id, 1,
            COALESCE(c.accession_no, 'CASE' || c.id) || '-C1',
            CASE
                WHEN c.consult_status = 'received' THEN 'reported'
                WHEN c.consult_status = 'processing' AND c.consult_pdf_path IS NOT NULL
                     AND NULL::integer IS NOT NULL THEN 'approved'
                WHEN c.consult_status = 'processing' AND c.consult_pdf_path IS NOT NULL THEN 'result_received'
                WHEN c.consult_status = 'processing' THEN 'sent'
                WHEN c.consult_pdf_path IS NOT NULL THEN 'result_received'
                ELSE 'requested'
            END,
            c.consult_reason,
            (
                SELECT r.destination_lab
                FROM outlab_consult_run_details d
                JOIN outlab_consult_runs r ON r.id = d.run_id
                WHERE d.case_type = 'gyne' AND d.case_id = c.id
                ORDER BY d.id DESC
                LIMIT 1
            ),
            c.consult_pdf_path, c.consult_pdf_received_at, NULL::integer, NULL::timestamp,
            now(), now()
        FROM gyne_cytology_cases c
        WHERE (c.is_out_lab_consult IS TRUE OR c.consult_status IN ('processing', 'received'))
          AND NOT EXISTS (
              SELECT 1 FROM outlab_consult_requests q
              WHERE q.case_type = 'gyne' AND q.case_id = c.id
          );

        UPDATE gyne_cytology_cases c
        SET is_out_lab_consult = TRUE
        WHERE c.is_out_lab_consult IS NOT TRUE
          AND EXISTS (
              SELECT 1 FROM outlab_consult_requests q
              WHERE q.case_type = 'gyne' AND q.case_id = c.id
          );

INSERT INTO outlab_consult_requests (
            case_type, case_id, seq, consult_no, status, reason, destination_lab,
            result_pdf_path, result_received_at, approved_by_id, approved_at,
            created_at, updated_at
        )
        SELECT
            'nongyne', c.id, 1,
            COALESCE(c.accession_no, 'CASE' || c.id) || '-C1',
            CASE
                WHEN c.consult_status = 'received' THEN 'reported'
                WHEN c.consult_status = 'processing' AND c.consult_pdf_path IS NOT NULL
                     AND NULL::integer IS NOT NULL THEN 'approved'
                WHEN c.consult_status = 'processing' AND c.consult_pdf_path IS NOT NULL THEN 'result_received'
                WHEN c.consult_status = 'processing' THEN 'sent'
                WHEN c.consult_pdf_path IS NOT NULL THEN 'result_received'
                ELSE 'requested'
            END,
            c.consult_reason,
            (
                SELECT r.destination_lab
                FROM outlab_consult_run_details d
                JOIN outlab_consult_runs r ON r.id = d.run_id
                WHERE d.case_type = 'nongyne' AND d.case_id = c.id
                ORDER BY d.id DESC
                LIMIT 1
            ),
            c.consult_pdf_path, c.consult_pdf_received_at, NULL::integer, NULL::timestamp,
            now(), now()
        FROM nongyne_cytology_cases c
        WHERE (c.is_out_lab_consult IS TRUE OR c.consult_status IN ('processing', 'received'))
          AND NOT EXISTS (
              SELECT 1 FROM outlab_consult_requests q
              WHERE q.case_type = 'nongyne' AND q.case_id = c.id
          );

        UPDATE nongyne_cytology_cases c
        SET is_out_lab_consult = TRUE
        WHERE c.is_out_lab_consult IS NOT TRUE
          AND EXISTS (
              SELECT 1 FROM outlab_consult_requests q
              WHERE q.case_type = 'nongyne' AND q.case_id = c.id
          );

UPDATE outlab_consult_run_details d
    SET consult_id = q.id
    FROM outlab_consult_requests q
    WHERE d.consult_id IS NULL
      AND q.case_type = d.case_type
      AND q.case_id = d.case_id
      AND q.seq = 1;

COMMIT;
