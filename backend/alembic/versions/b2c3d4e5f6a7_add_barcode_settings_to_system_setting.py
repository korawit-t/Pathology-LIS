"""add barcode settings to system_setting

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-30

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('system_settings', sa.Column('barcode_opd_prefix', sa.String(), nullable=True, server_default='2'))
    op.add_column('system_settings', sa.Column('barcode_ipd_prefix', sa.String(), nullable=True, server_default='3'))
    op.add_column('system_settings', sa.Column('barcode_surgical_type_code', sa.String(), nullable=True, server_default='08'))
    op.add_column('system_settings', sa.Column('barcode_gyne_type_code', sa.String(), nullable=True, server_default='09'))
    op.add_column('system_settings', sa.Column('barcode_nongyne_type_code', sa.String(), nullable=True, server_default='10'))


def downgrade():
    op.drop_column('system_settings', 'barcode_nongyne_type_code')
    op.drop_column('system_settings', 'barcode_gyne_type_code')
    op.drop_column('system_settings', 'barcode_surgical_type_code')
    op.drop_column('system_settings', 'barcode_ipd_prefix')
    op.drop_column('system_settings', 'barcode_opd_prefix')
