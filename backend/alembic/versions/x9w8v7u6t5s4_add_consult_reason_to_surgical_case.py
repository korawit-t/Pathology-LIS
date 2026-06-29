"""add consult_reason to surgical_case

Revision ID: x9w8v7u6t5s4
Revises: b5c6d7e8f9a0
Create Date: 2026-05-26

"""
from alembic import op
import sqlalchemy as sa

revision = 'x9w8v7u6t5s4'
down_revision = 'b5c6d7e8f9a0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'surgical_cases',
        sa.Column('consult_reason', sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column('surgical_cases', 'consult_reason')
