"""add is_frozen_section to surgical_case

Revision ID: fs001
Revises: z9y8x7w6v5u4
Create Date: 2026-06-27

"""
from alembic import op
import sqlalchemy as sa

revision = "fs001"
down_revision = "z9y8x7w6v5u4"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE surgical_cases ADD COLUMN IF NOT EXISTS is_frozen_section BOOLEAN DEFAULT FALSE"
    )


def downgrade():
    op.execute("ALTER TABLE surgical_cases DROP COLUMN IF EXISTS is_frozen_section")
