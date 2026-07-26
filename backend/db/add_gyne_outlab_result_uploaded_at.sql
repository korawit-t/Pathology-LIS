-- Adds gyne_cytology_cases.out_lab_result_uploaded_at: the timestamp of the
-- most recent outlab test result PDF upload (set in
-- routers/gyne_cyto_case.py::upload_outlab_test_result). Previously there was
-- no dedicated record of the upload date — only the generic updated_at
-- (bumped by any case edit) and outlab_result_approved_at (the sign-off
-- date, not the upload date).
--
-- Backfill: updated_at was bumped by the same write that set
-- out_lab_result_pdf_path, so it's the closest available approximation for
-- results uploaded before this column existed.
--
-- Equivalent to Alembic revision 7d5f343beac2. After applying this manually,
-- run `alembic stamp head` (or `alembic stamp 7d5f343beac2`) so the next
-- `alembic upgrade head` does not try to re-run it.

BEGIN;

ALTER TABLE gyne_cytology_cases
    ADD COLUMN IF NOT EXISTS out_lab_result_uploaded_at TIMESTAMP;

UPDATE gyne_cytology_cases
    SET out_lab_result_uploaded_at = updated_at
    WHERE out_lab_result_pdf_path IS NOT NULL AND out_lab_result_uploaded_at IS NULL;

COMMIT;
