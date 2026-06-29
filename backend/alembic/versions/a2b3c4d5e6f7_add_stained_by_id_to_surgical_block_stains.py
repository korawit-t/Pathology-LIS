"""add stained_by_id to surgical_block_stains

Revision ID: a2b3c4d5e6f7
Revises: f3a1b2c4d5e6
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = "a2b3c4d5e6f7"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "surgical_block_stains",
        sa.Column("stained_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade():
    op.drop_column("surgical_block_stains", "stained_by_id")
