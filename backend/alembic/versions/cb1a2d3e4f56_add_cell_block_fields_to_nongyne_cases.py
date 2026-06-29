"""add cell block fields to nongyne_cytology_cases

Revision ID: cb1a2d3e4f56
Revises: 984e463c9c97
Create Date: 2026-05-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "cb1a2d3e4f56"
down_revision = "984e463c9c97"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nongyne_cytology_cases", sa.Column("is_cell_block", sa.Boolean(), nullable=True, server_default="false"))
    op.add_column("nongyne_cytology_cases", sa.Column("cell_block_status", sa.String(), nullable=True))
    op.add_column("nongyne_cytology_cases", sa.Column("cell_block_prepared_at", sa.DateTime(), nullable=True))
    op.add_column("nongyne_cytology_cases", sa.Column("cell_block_prepared_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("nongyne_cytology_cases", sa.Column("cell_block_linked_accession", sa.String(), nullable=True))
    op.create_index("ix_nongyne_cytology_cases_is_cell_block", "nongyne_cytology_cases", ["is_cell_block"])


def downgrade() -> None:
    op.drop_index("ix_nongyne_cytology_cases_is_cell_block", table_name="nongyne_cytology_cases")
    op.drop_column("nongyne_cytology_cases", "cell_block_linked_accession")
    op.drop_column("nongyne_cytology_cases", "cell_block_prepared_by_id")
    op.drop_column("nongyne_cytology_cases", "cell_block_prepared_at")
    op.drop_column("nongyne_cytology_cases", "cell_block_status")
    op.drop_column("nongyne_cytology_cases", "is_cell_block")
