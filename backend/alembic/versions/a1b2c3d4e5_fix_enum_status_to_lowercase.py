"""fix enum type labels to match Python enum values (values_callable)

Revision ID: a1b2c3d4e5
Revises: 8fec99595172
Create Date: 2026-06-22

ALTER TYPE RENAME VALUE automatically updates all stored values in every column
that uses the type — no UPDATE needed.
Each block is idempotent: skipped if the old label is already gone.
"""
from alembic import op

revision = 'a1b2c3d4e5'
down_revision = '8fec99595172'
branch_labels = None
depends_on = None


def _rename_if_exists(type_name: str, old: str, new: str):
    op.execute(f"""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                WHERE t.typname = '{type_name}' AND e.enumlabel = '{old}'
            ) THEN
                ALTER TYPE {type_name} RENAME VALUE '{old}' TO '{new}';
            END IF;
        END $$;
    """)


def upgrade():
    # reportstatus  (surgical_reports.status)
    _rename_if_exists('reportstatus', 'DRAFT', 'draft')
    _rename_if_exists('reportstatus', 'PENDING_APPROVAL', 'pending')
    _rename_if_exists('reportstatus', 'PUBLISHED', 'published')
    _rename_if_exists('reportstatus', 'CANCELLED', 'cancelled')

    # reporttype  (surgical_reports.report_type)
    _rename_if_exists('reporttype', 'FINAL', 'Final')
    _rename_if_exists('reporttype', 'ADDENDUM', 'Addendum')
    _rename_if_exists('reporttype', 'CORRECTED', 'Corrected')

    # gynereportstatus  (gyne_cyto_reports.status)
    _rename_if_exists('gynereportstatus', 'DRAFT', 'draft')
    _rename_if_exists('gynereportstatus', 'PENDING_APPROVAL', 'pending')
    _rename_if_exists('gynereportstatus', 'PUBLISHED', 'published')
    _rename_if_exists('gynereportstatus', 'CANCELLED', 'cancelled')

    # gynereporttype  (gyne_cyto_reports.report_type)
    _rename_if_exists('gynereporttype', 'FINAL', 'Final')
    _rename_if_exists('gynereporttype', 'ADDENDUM', 'Addendum')
    _rename_if_exists('gynereporttype', 'CORRECTED', 'Corrected')

    # nongynereportstatus  (nongyne_cyto_reports.status)
    _rename_if_exists('nongynereportstatus', 'DRAFT', 'draft')
    _rename_if_exists('nongynereportstatus', 'PENDING_APPROVAL', 'pending')
    _rename_if_exists('nongynereportstatus', 'PUBLISHED', 'published')
    _rename_if_exists('nongynereportstatus', 'CANCELLED', 'cancelled')

    # nongynereporttype  (nongyne_cyto_reports.report_type)
    _rename_if_exists('nongynereporttype', 'FINAL', 'Final')
    _rename_if_exists('nongynereporttype', 'ADDENDUM', 'Addendum')
    _rename_if_exists('nongynereporttype', 'CORRECTED', 'Corrected')
    _rename_if_exists('nongynereporttype', 'REVISED', 'Revised')


def downgrade():
    pass
