-- Adds the namespace stamped into every slide sticker's QR payload, e.g. the
-- "BKK01" in BKK01-SBS-48215.
--
-- The QR used to carry an accession+block composite, which named the *block* a
-- slide came from, so every slide cut from one block shared a payload and the
-- system could not tell which slide was in your hand. It now carries the
-- slide's own id, and lab_code keeps two deployments of this LIS from both
-- minting SBS-48215 — which matters when a slide leaves for an outlab consult
-- or a WSI scanner names a file after the label.
--
-- Nullable on purpose: left unset, stickers print the bare id, still unique
-- within this database. Set the installation's own code in
-- Settings -> General (master row only) when you have one. Stickers already
-- printed keep scanning either way — app/utils/slide_barcode.py accepts the
-- namespaced id, the bare id, and the old composite.
--
-- Equivalent to Alembic revision 1afed0bae4a7. After applying this manually,
-- run `alembic stamp head` so the next `alembic upgrade head` does not try
-- to re-run it.

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS lab_code VARCHAR;
