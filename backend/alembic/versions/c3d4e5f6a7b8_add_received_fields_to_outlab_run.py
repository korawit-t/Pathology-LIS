"""add received fields to surgical outlab run

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-30

"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('surgical_outlab_runs', sa.Column('received_at', sa.DateTime(), nullable=True))
    op.add_column('surgical_outlab_runs', sa.Column('received_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))


def downgrade():
    op.drop_column('surgical_outlab_runs', 'received_by_id')
    op.drop_column('surgical_outlab_runs', 'received_at')
