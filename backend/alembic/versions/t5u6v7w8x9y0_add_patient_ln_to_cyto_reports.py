"""add patient_ln to gyne and nongyne cyto reports

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa

revision = 't5u6v7w8x9y0'
down_revision = 's4t5u6v7w8x9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('gyne_cyto_reports', sa.Column('patient_ln', sa.String(), nullable=True))
    op.add_column('nongyne_cyto_reports', sa.Column('patient_ln', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('nongyne_cyto_reports', 'patient_ln')
    op.drop_column('gyne_cyto_reports', 'patient_ln')
