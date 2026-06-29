"""add channel_ids to notification_rules

Revision ID: a1b2c3
Revises: x1y2z6
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3'
down_revision = 'x1y2z6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('notification_rules', sa.Column('channel_ids', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('notification_rules', 'channel_ids')
