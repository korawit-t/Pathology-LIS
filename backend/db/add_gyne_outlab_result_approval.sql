-- Adds pathologist sign-off tracking to gyne_cytology_cases.out_lab_result_pdf_path:
-- outlab_result_approved_by_id / outlab_result_approved_at. Until approved,
-- an uploaded outlab test result PDF is not visible to clinicians (see
-- crud/report_archive.py's has_outlab_result flag and the clinician-role
-- gate in routers/gyne_cyto_case.py::get_outlab_test_result). Re-uploading a
-- replacement PDF resets both fields, requiring fresh sign-off.
--
-- Backfill: every case that already had a result uploaded before this
-- change ships is grandfathered in as approved, so clinicians who could
-- already see a result don't suddenly lose access to it.
--
-- Equivalent to Alembic revision 599755f6b01a. After applying this manually,
-- run `alembic stamp head` (or `alembic stamp 599755f6b01a`) so the next
-- `alembic upgrade head` does not try to re-run it.

BEGIN;

ALTER TABLE gyne_cytology_cases
    ADD COLUMN IF NOT EXISTS outlab_result_approved_by_id INTEGER REFERENCES users(id);
ALTER TABLE gyne_cytology_cases
    ADD COLUMN IF NOT EXISTS outlab_result_approved_at TIMESTAMP;

UPDATE gyne_cytology_cases
    SET outlab_result_approved_at = NOW()
    WHERE out_lab_result_pdf_path IS NOT NULL AND outlab_result_approved_at IS NULL;

COMMIT;
