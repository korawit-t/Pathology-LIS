-- Adds the controlled-document number printed in the bottom-left corner of the
-- specimen disposal checklist (e.g. "FM-PAT-025 แก้ไขครั้งที่ 01"). Free text,
-- because every lab's quality system lays the number, revision and effective
-- date out differently.
--
-- Equivalent to Alembic revision be59b30390b5. After applying this manually,
-- run `alembic stamp head` so the next `alembic upgrade head` does not try
-- to re-run it.

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS specimen_disposal_doc_no VARCHAR;
