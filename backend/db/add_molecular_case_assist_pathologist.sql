-- Adds assist_pathologist_id to molecular_cases — the assisting/requesting
-- pathologist for a Molecular case, editable regardless of origin. Defaults
-- to the ordering pathologist (registrar_id) when the case is auto-spawned
-- from a block-level stain order (see crud/surgical_block_stain.py::create_stain
-- -> crud/molecular_case.py::create_molecular_case_from_stain); picked
-- explicitly on the standalone/"From Surgical Case" registration forms.
--
-- Equivalent to Alembic revision cccb492b1248. After applying this manually,
-- run `alembic stamp head` (or `alembic stamp cccb492b1248`) so the next
-- `alembic upgrade head` does not try to re-run it.

BEGIN;

ALTER TABLE molecular_cases
    ADD COLUMN IF NOT EXISTS assist_pathologist_id INTEGER REFERENCES users(id);

COMMIT;
