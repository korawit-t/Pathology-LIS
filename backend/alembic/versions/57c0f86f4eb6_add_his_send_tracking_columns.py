"""add_his_send_tracking_columns

Revision ID: 57c0f86f4eb6
Revises: afbe78bdbd0d
Create Date: 2026-06-27 10:41:34.373116

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '57c0f86f4eb6'
down_revision: Union[str, Sequence[str], None] = 'afbe78bdbd0d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('surgical_reports', sa.Column('his_sent_at', sa.DateTime(), nullable=True))
    op.add_column('surgical_reports', sa.Column('his_send_error', sa.Text(), nullable=True))
    op.add_column('surgical_reports', sa.Column('his_reference_id', sa.String(), nullable=True))
    op.add_column('surgical_reports', sa.Column('his_send_retries', sa.Integer(), nullable=False, server_default='0'))
    op.create_index('idx_surgical_reports_his_sent_at', 'surgical_reports', ['his_sent_at'])

    op.add_column('gyne_cyto_reports', sa.Column('his_sent_at', sa.DateTime(), nullable=True))
    op.add_column('gyne_cyto_reports', sa.Column('his_send_error', sa.Text(), nullable=True))
    op.add_column('gyne_cyto_reports', sa.Column('his_reference_id', sa.String(), nullable=True))
    op.add_column('gyne_cyto_reports', sa.Column('his_send_retries', sa.Integer(), nullable=False, server_default='0'))
    op.create_index('idx_gyne_cyto_reports_his_sent_at', 'gyne_cyto_reports', ['his_sent_at'])

    op.add_column('nongyne_cyto_reports', sa.Column('his_sent_at', sa.DateTime(), nullable=True))
    op.add_column('nongyne_cyto_reports', sa.Column('his_send_error', sa.Text(), nullable=True))
    op.add_column('nongyne_cyto_reports', sa.Column('his_reference_id', sa.String(), nullable=True))
    op.add_column('nongyne_cyto_reports', sa.Column('his_send_retries', sa.Integer(), nullable=False, server_default='0'))
    op.create_index('idx_nongyne_cyto_reports_his_sent_at', 'nongyne_cyto_reports', ['his_sent_at'])


def downgrade() -> None:
    op.drop_index('idx_nongyne_cyto_reports_his_sent_at', table_name='nongyne_cyto_reports')
    op.drop_column('nongyne_cyto_reports', 'his_send_retries')
    op.drop_column('nongyne_cyto_reports', 'his_reference_id')
    op.drop_column('nongyne_cyto_reports', 'his_send_error')
    op.drop_column('nongyne_cyto_reports', 'his_sent_at')

    op.drop_index('idx_gyne_cyto_reports_his_sent_at', table_name='gyne_cyto_reports')
    op.drop_column('gyne_cyto_reports', 'his_send_retries')
    op.drop_column('gyne_cyto_reports', 'his_reference_id')
    op.drop_column('gyne_cyto_reports', 'his_send_error')
    op.drop_column('gyne_cyto_reports', 'his_sent_at')

    op.drop_index('idx_surgical_reports_his_sent_at', table_name='surgical_reports')
    op.drop_column('surgical_reports', 'his_send_retries')
    op.drop_column('surgical_reports', 'his_reference_id')
    op.drop_column('surgical_reports', 'his_send_error')
    op.drop_column('surgical_reports', 'his_sent_at')
