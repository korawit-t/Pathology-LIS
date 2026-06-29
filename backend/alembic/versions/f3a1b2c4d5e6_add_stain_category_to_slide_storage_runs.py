"""Add stain_category to slide_storage_runs

Revision ID: f3a1b2c4d5e6
Revises: e24970e2e79a
Create Date: 2026-04-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3a1b2c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'e24970e2e79a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('slide_storage_runs', sa.Column('stain_category', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('slide_storage_runs', 'stain_category')
