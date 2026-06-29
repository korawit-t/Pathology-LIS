"""add tracking_number to surgical_outlab_runs

Revision ID: aac48a8f9259
Revises: 72a621013b42
Create Date: 2026-05-18 11:08:15.915871

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'aac48a8f9259'
down_revision: Union[str, Sequence[str], None] = '72a621013b42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('surgical_outlab_runs', sa.Column('tracking_number', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('surgical_outlab_runs', 'tracking_number')
