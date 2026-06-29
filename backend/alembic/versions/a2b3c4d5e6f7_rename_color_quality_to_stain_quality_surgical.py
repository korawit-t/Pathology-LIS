"""rename color_quality to stain_quality in surgical_cases

Revision ID: c4d5e6f7a8b9
Revises: aac48a8f9259
Create Date: 2026-06-12

"""
from alembic import op

revision = "c4d5e6f7a8b9"
down_revision = "aac48a8f9259"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("surgical_cases", "color_quality", new_column_name="stain_quality")


def downgrade():
    op.alter_column("surgical_cases", "stain_quality", new_column_name="color_quality")
