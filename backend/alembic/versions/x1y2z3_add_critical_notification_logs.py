"""add critical_notification_logs table

Revision ID: x1y2z3
Revises: w8x9y0z1a2b3
Create Date: 2026-06-09

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'x1y2z3'
down_revision: Union[str, None] = 'w8x9y0z1a2b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'critical_notification_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('case_id', sa.Integer(), nullable=False, index=True),
        sa.Column('case_type', sa.String(50), nullable=False),
        sa.Column('notification_type', sa.String(50), nullable=False),
        sa.Column('notified_at', sa.DateTime(), nullable=False),
        sa.Column('recipient_name', sa.String(200), nullable=False),
        sa.Column('recipient_role', sa.String(100), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('notified_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('idx_critical_notif_case', 'critical_notification_logs', ['case_id', 'case_type'])
    op.create_index('idx_critical_notif_at', 'critical_notification_logs', ['notified_at'])


def downgrade() -> None:
    op.drop_index('idx_critical_notif_at', table_name='critical_notification_logs')
    op.drop_index('idx_critical_notif_case', table_name='critical_notification_logs')
    op.drop_table('critical_notification_logs')
