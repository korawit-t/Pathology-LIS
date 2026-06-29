"""add report template columns to system_settings

Revision ID: b2c3d4e5f6a1
Revises: z9y8x7w6v5u4
Create Date: 2026-05-25

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a1'
down_revision = 'z9y8x7w6v5u4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('system_settings', sa.Column('surgical_report_template', sa.String(), nullable=True))
    op.add_column('system_settings', sa.Column('gyne_report_template', sa.String(), nullable=True))
    op.add_column('system_settings', sa.Column('nongyne_report_template', sa.String(), nullable=True))


def downgrade():
    op.drop_column('system_settings', 'nongyne_report_template')
    op.drop_column('system_settings', 'gyne_report_template')
    op.drop_column('system_settings', 'surgical_report_template')
