"""add show_icd_o_in_report to system_settings

Revision ID: llm_profile005
Revises: llm_profile004
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'llm_profile005'
down_revision = 'llm_profile004'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'system_settings',
        sa.Column('show_icd_o_in_report', sa.Boolean(), nullable=False, server_default='false')
    )


def downgrade():
    op.drop_column('system_settings', 'show_icd_o_in_report')
