"""fix gynereporttype missing/uppercase REVISED value

Revision ID: b7c8d9e0f1a2
Revises: a8a35626bbca
Create Date: 2026-07-01

Migration a1b2c3d4e5 (fix_enum_status_to_lowercase) renamed FINAL/ADDENDUM/
CORRECTED on gynereporttype to proper case but missed REVISED (the sibling
nongynereporttype migration included it). Publishing a revised Gyne report
(version_no > 1) sets report_type = GyneReportType.REVISED, whose Python
value is "Revised" — this fails with
psycopg2.errors.InvalidTextRepresentation because the DB enum still only
has "REVISED" (or is missing the label entirely).

Idempotent: renames the old label if present, otherwise adds "Revised" if
it isn't there yet, otherwise no-ops.
"""
from alembic import op

revision = 'b7c8d9e0f1a2'
down_revision = 'a8a35626bbca'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                WHERE t.typname = 'gynereporttype' AND e.enumlabel = 'REVISED'
            ) THEN
                ALTER TYPE gynereporttype RENAME VALUE 'REVISED' TO 'Revised';
            ELSIF NOT EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                WHERE t.typname = 'gynereporttype' AND e.enumlabel = 'Revised'
            ) THEN
                ALTER TYPE gynereporttype ADD VALUE 'Revised';
            END IF;
        END $$;
    """)


def downgrade():
    pass
