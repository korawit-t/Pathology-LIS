"""make case_id nullable on report tables for legacy migration

Revision ID: nullable00001
Revises: a1b2c3d4e5f6
Create Date: 2026-06-12

"""
from alembic import op

revision = 'nullable00001'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("surgical_reports",     "case_id", nullable=True)
    op.alter_column("gyne_cyto_reports",    "case_id", nullable=True)
    op.alter_column("nongyne_cyto_reports", "case_id", nullable=True)


def downgrade():
    op.alter_column("surgical_reports",     "case_id", nullable=False)
    op.alter_column("gyne_cyto_reports",    "case_id", nullable=False)
    op.alter_column("nongyne_cyto_reports", "case_id", nullable=False)
