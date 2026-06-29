"""add is_express to gyne and nongyne cyto cases

Revision ID: a2b3c4
Revises: a1b2c3
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'a2b3c4'
down_revision = 'a1b2c3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('gyne_cytology_cases', sa.Column('is_express', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index('ix_gyne_cytology_cases_is_express', 'gyne_cytology_cases', ['is_express'])
    op.add_column('nongyne_cytology_cases', sa.Column('is_express', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index('ix_nongyne_cytology_cases_is_express', 'nongyne_cytology_cases', ['is_express'])


def downgrade():
    op.drop_index('ix_nongyne_cytology_cases_is_express', table_name='nongyne_cytology_cases')
    op.drop_column('nongyne_cytology_cases', 'is_express')
    op.drop_index('ix_gyne_cytology_cases_is_express', table_name='gyne_cytology_cases')
    op.drop_column('gyne_cytology_cases', 'is_express')
