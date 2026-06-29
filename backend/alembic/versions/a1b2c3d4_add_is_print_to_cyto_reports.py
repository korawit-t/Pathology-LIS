"""add is_print to gyne and nongyne cyto reports

Revision ID: a1b2c3d4
Revises: z9y8x7w6v5u4
Create Date: 2026-06-12

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4'
down_revision = 'z9y8x7w6v5u4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('gyne_cyto_reports',
                  sa.Column('is_print', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('nongyne_cyto_reports',
                  sa.Column('is_print', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('gyne_cyto_reports', 'is_print')
    op.drop_column('nongyne_cyto_reports', 'is_print')
