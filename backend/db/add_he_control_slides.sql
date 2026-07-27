-- Adds the he_control_slides table for the daily H&E QC control-slide
-- workflow (one slide/day, not tied to any patient/case). Records who ran
-- it and when; a redo is a new row (no unique constraint on control_date,
-- multiple entries per day are expected/allowed).
--
-- Equivalent to Alembic revision ec9625fd6847. After applying this manually,
-- run `alembic stamp head` so the next `alembic upgrade head` does not try
-- to re-run it.

BEGIN;

CREATE TABLE IF NOT EXISTS he_control_slides (
    id SERIAL PRIMARY KEY,
    control_no VARCHAR NOT NULL,
    control_date DATE NOT NULL,
    performed_by_id INTEGER NOT NULL REFERENCES users(id),
    performed_at TIMESTAMP NOT NULL DEFAULT now(),
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_he_control_slides_id ON he_control_slides (id);
CREATE INDEX IF NOT EXISTS ix_he_control_slides_control_no ON he_control_slides (control_no);
CREATE INDEX IF NOT EXISTS ix_he_control_slides_control_date ON he_control_slides (control_date);

COMMIT;
