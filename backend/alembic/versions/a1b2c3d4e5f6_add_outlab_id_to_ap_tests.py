"""add outlab_id to anatomical_pathology_tests

Revision ID: outlabapt0001
Revises: f3a1b2c4d5e6
Create Date: 2026-04-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'outlabapt0001'
down_revision = 'f3a1b2c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'anatomical_pathology_tests',
        sa.Column('outlab_id', sa.Integer(), sa.ForeignKey('external_labs.id'), nullable=True)
    )


def downgrade():
    op.drop_column('anatomical_pathology_tests', 'outlab_id')
