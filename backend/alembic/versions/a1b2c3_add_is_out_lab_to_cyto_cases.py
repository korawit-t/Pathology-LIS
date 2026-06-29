"""add is_out_lab to gyne and nongyne cyto cases

Revision ID: b2c3d4
Revises: a1b2c3, z9y8x7w6v5u4, llm_profile005
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4"
down_revision = ("a1b2c3", "z9y8x7w6v5u4", "llm_profile005")
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("gyne_cytology_cases", sa.Column("is_out_lab", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_gyne_cytology_cases_is_out_lab", "gyne_cytology_cases", ["is_out_lab"])

    op.add_column("nongyne_cytology_cases", sa.Column("is_out_lab", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_nongyne_cytology_cases_is_out_lab", "nongyne_cytology_cases", ["is_out_lab"])


def downgrade():
    op.drop_index("ix_nongyne_cytology_cases_is_out_lab", table_name="nongyne_cytology_cases")
    op.drop_column("nongyne_cytology_cases", "is_out_lab")

    op.drop_index("ix_gyne_cytology_cases_is_out_lab", table_name="gyne_cytology_cases")
    op.drop_column("gyne_cytology_cases", "is_out_lab")
