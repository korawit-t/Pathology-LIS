"""add consult run receive and block return fields

Revision ID: a3b4c5d6e7f8
Revises: z9y8x7w6v5u4
Create Date: 2026-05-26

"""
from alembic import op
import sqlalchemy as sa

revision = 'a3b4c5d6e7f8'
down_revision = 'cb1a2d3e4f56'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('outlab_consult_runs', sa.Column('received_at', sa.DateTime(), nullable=True))
    op.add_column('outlab_consult_runs', sa.Column('received_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))

    op.add_column('outlab_consult_run_details', sa.Column('block_code', sa.String(), nullable=True))
    op.add_column('outlab_consult_run_details', sa.Column('block_returned', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('outlab_consult_run_details', sa.Column('block_returned_at', sa.DateTime(), nullable=True))
    op.add_column('outlab_consult_run_details', sa.Column('block_returned_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))


def downgrade():
    op.drop_column('outlab_consult_run_details', 'block_returned_by_id')
    op.drop_column('outlab_consult_run_details', 'block_returned_at')
    op.drop_column('outlab_consult_run_details', 'block_returned')
    op.drop_column('outlab_consult_run_details', 'block_code')
    op.drop_column('outlab_consult_runs', 'received_by_id')
    op.drop_column('outlab_consult_runs', 'received_at')
