"""add per-detail receive to outlab run details

Revision ID: 7d63866f5a06
Revises: b7c8d9e0f1a2
Create Date: 2026-07-01

"""
from alembic import op
import sqlalchemy as sa

revision = '7d63866f5a06'
down_revision = 'b7c8d9e0f1a2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'surgical_outlab_run_details',
        sa.Column('received_at', sa.DateTime(), nullable=True),
    )
    op.add_column(
        'surgical_outlab_run_details',
        sa.Column('received_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )


def downgrade():
    op.drop_column('surgical_outlab_run_details', 'received_by_id')
    op.drop_column('surgical_outlab_run_details', 'received_at')
