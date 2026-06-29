"""add notified_channel_names to critical_notification_logs

Revision ID: x1y2z6
Revises: x1y2z5
Create Date: 2026-06-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'x1y2z6'
down_revision = 'x1y2z5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('critical_notification_logs',
                  sa.Column('notified_channel_names', postgresql.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('critical_notification_logs', 'notified_channel_names')
