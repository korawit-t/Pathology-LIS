-- Adds the molecular_cases table (own M26- accession series, mirroring the
-- surgical/gyne/non-gyne pattern) plus the molecular_accession_prefix column
-- on system_settings. A MolecularCase is created either:
--   (a) automatically, whenever a Molecular-category AnatomicalPathologyTest
--       is ordered on a Surgical case's block (see
--       crud/surgical_block_stain.py::create_stain), with that Surgical case
--       as parent (parent_case_id/stain_id set), or
--   (b) standalone, registered directly with its own patient/hospital/etc.
--       (parent_case_id/stain_id null, patient_id and friends populated).
--
-- Equivalent to Alembic revisions 84d42681d7e2 and d58ce869a89a. After
-- applying this manually, run `alembic stamp head` (or
-- `alembic stamp d58ce869a89a`) so the next `alembic upgrade head` does not
-- try to re-run it.

BEGIN;

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS molecular_accession_prefix VARCHAR NOT NULL DEFAULT 'M';

CREATE TABLE IF NOT EXISTS molecular_cases (
    id SERIAL PRIMARY KEY,
    accession_no VARCHAR NOT NULL,
    parent_case_id INTEGER REFERENCES surgical_cases(id) ON DELETE CASCADE,
    stain_id INTEGER REFERENCES surgical_block_stains(id) ON DELETE SET NULL,
    ap_test_id INTEGER NOT NULL REFERENCES anatomical_pathology_tests(id),
    patient_id INTEGER REFERENCES patients(id),
    hospital_id INTEGER REFERENCES hospitals(id),
    department_id INTEGER REFERENCES departments(id),
    medical_scheme_id INTEGER REFERENCES medical_schemes(id),
    hn VARCHAR,
    an VARCHAR,
    vn VARCHAR,
    clinical_diagnosis TEXT,
    clinician_name VARCHAR,
    collect_at TIMESTAMP,
    status VARCHAR DEFAULT 'pending',
    is_outlab BOOLEAN NOT NULL DEFAULT false,
    result_text TEXT,
    outlab_pdf_path VARCHAR,
    outlab_pdf_received_at TIMESTAMP,
    registrar_id INTEGER NOT NULL REFERENCES users(id),
    registered_at TIMESTAMP DEFAULT now(),
    reported_by_id INTEGER REFERENCES users(id),
    reported_at TIMESTAMP,
    is_cancelled BOOLEAN DEFAULT false,
    cancelled_at TIMESTAMP,
    cancelled_by_id INTEGER REFERENCES users(id),
    cancel_reason TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_molecular_cases_accession_no ON molecular_cases (accession_no);
CREATE INDEX IF NOT EXISTS ix_molecular_cases_id ON molecular_cases (id);
CREATE INDEX IF NOT EXISTS ix_molecular_cases_parent_case_id ON molecular_cases (parent_case_id);
CREATE INDEX IF NOT EXISTS ix_molecular_cases_stain_id ON molecular_cases (stain_id);
CREATE INDEX IF NOT EXISTS ix_molecular_cases_status ON molecular_cases (status);
CREATE INDEX IF NOT EXISTS ix_molecular_cases_is_cancelled ON molecular_cases (is_cancelled);
CREATE INDEX IF NOT EXISTS ix_molecular_cases_hn ON molecular_cases (hn);

COMMIT;
