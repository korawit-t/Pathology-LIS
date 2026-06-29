"""make recipient_name nullable in critical_notification_logs

Revision ID: x1y2z4
Revises: x1y2z3
Create Date: 2026-06-09

"""
from alembic import op
import sqlalchemy as sa

revision: str = 'x1y2z4'
down_revision = 'x1y2z3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('critical_notification_logs', 'recipient_name',
                    existing_type=sa.String(200),
                    nullable=True)


def downgrade() -> None:
    op.alter_column('critical_notification_logs', 'recipient_name',
                    existing_type=sa.String(200),
                    nullable=False)
