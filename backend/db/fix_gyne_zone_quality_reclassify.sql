-- Reclassify mis-tagged gyne_specimen_adequacies rows from ZONE to QUALITY.
-- Codes 013, 014, 015, 017 are "reason for rejection/unsatisfactory" text,
-- not endocervical/transformation zone status, and were incorrectly seeded
-- under group_type = 'ZONE'. Moving them to 'QUALITY' matches seed_data.py
-- and makes them available as Unsatisfactory/Limited-by reasons.

BEGIN;

-- Preview affected rows before changing anything.
SELECT id, group_type, code, text
FROM gyne_specimen_adequacies
WHERE group_type = 'ZONE' AND code IN ('013', '014', '015', '017')
ORDER BY code;

UPDATE gyne_specimen_adequacies
SET group_type = 'QUALITY'
WHERE group_type = 'ZONE' AND code IN ('013', '014', '015', '017');

-- Verify: ZONE should now only contain 011, 012, 016.
SELECT id, group_type, code, text
FROM gyne_specimen_adequacies
WHERE group_type = 'ZONE'
ORDER BY code;

COMMIT;
