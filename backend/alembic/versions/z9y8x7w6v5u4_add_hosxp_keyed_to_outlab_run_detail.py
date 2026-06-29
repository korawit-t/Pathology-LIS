"""add hosxp keyed to outlab run detail

Revision ID: z9y8x7w6v5u4
Revises: d07e288f6205
Create Date: 2026-05-22

"""
from alembic import op
import sqlalchemy as sa

revision = 'z9y8x7w6v5u4'
down_revision = 'd07e288f6205'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'surgical_outlab_run_details',
        sa.Column('is_hosxp_keyed', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.add_column(
        'surgical_outlab_run_details',
        sa.Column('hosxp_keyed_at', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_column('surgical_outlab_run_details', 'hosxp_keyed_at')
    op.drop_column('surgical_outlab_run_details', 'is_hosxp_keyed')
