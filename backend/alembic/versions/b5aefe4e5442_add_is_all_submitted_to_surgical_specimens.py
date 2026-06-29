"""add is_all_submitted to surgical_specimens

Revision ID: b5aefe4e5442
Revises: f5647e10245a
Create Date: 2026-05-18 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b5aefe4e5442'
down_revision: Union[str, Sequence[str], None] = 'f5647e10245a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'surgical_specimens',
        sa.Column('is_all_submitted', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('surgical_specimens', 'is_all_submitted')
