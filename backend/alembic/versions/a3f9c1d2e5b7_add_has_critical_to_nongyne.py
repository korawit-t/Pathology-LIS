"""add has_critical to nongyne_cytology_cases and nongyne_cyto_reports

Revision ID: a3f9c1d2e5b7
Revises: 75cb6000925e
Create Date: 2026-07-16 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "a3f9c1d2e5b7"
down_revision = "75cb6000925e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nongyne_cytology_cases", sa.Column("has_critical", sa.Boolean(), nullable=True, server_default="false"))
    op.add_column("nongyne_cyto_reports", sa.Column("has_critical", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_nongyne_cyto_reports_has_critical", "nongyne_cyto_reports", ["has_critical"])


def downgrade() -> None:
    op.drop_index("ix_nongyne_cyto_reports_has_critical", table_name="nongyne_cyto_reports")
    op.drop_column("nongyne_cyto_reports", "has_critical")
    op.drop_column("nongyne_cytology_cases", "has_critical")
