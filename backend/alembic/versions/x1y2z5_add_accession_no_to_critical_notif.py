"""add accession_no to critical_notification_logs

Revision ID: x1y2z5
Revises: x1y2z4
Create Date: 2026-06-09

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'x1y2z5'
down_revision = 'x1y2z4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('critical_notification_logs',
                  sa.Column('accession_no', sa.String(50), nullable=True))
    op.create_index('idx_critical_notif_accession', 'critical_notification_logs', ['accession_no'])


def downgrade() -> None:
    op.drop_index('idx_critical_notif_accession', table_name='critical_notification_logs')
    op.drop_column('critical_notification_logs', 'accession_no')
