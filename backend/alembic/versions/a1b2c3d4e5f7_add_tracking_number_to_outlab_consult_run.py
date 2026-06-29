"""add tracking_number to outlab_consult_runs

Revision ID: tracking00001
Revises: a1b2c3d4e5f7
Create Date: 2026-06-12

"""
from alembic import op
import sqlalchemy as sa

revision = 'tracking00001'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("outlab_consult_runs", sa.Column("tracking_number", sa.String(), nullable=True))


def downgrade():
    op.drop_column("outlab_consult_runs", "tracking_number")
