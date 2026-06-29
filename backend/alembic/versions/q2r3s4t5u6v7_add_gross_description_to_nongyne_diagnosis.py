"""add gross description to nongyne diagnosis

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'q2r3s4t5u6v7'
down_revision = 'p1q2r3s4t5u6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('nongyne_diagnoses', sa.Column('gross_description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('nongyne_diagnoses', 'gross_description')
