"""add is_rose to nongyne_cyto_cases

Revision ID: rose001
Revises: fs001
Create Date: 2026-06-27

"""
from alembic import op

revision = "rose001"
down_revision = "fs001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE nongyne_cytology_cases ADD COLUMN IF NOT EXISTS is_rose BOOLEAN DEFAULT FALSE"
    )


def downgrade():
    op.execute("ALTER TABLE nongyne_cytology_cases DROP COLUMN IF EXISTS is_rose")
