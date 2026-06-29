"""add is_tissue_uncountable to surgical_blocks

Revision ID: f5647e10245a
Revises: 0ac2941e8a8d
Create Date: 2026-05-18 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f5647e10245a'
down_revision: Union[str, Sequence[str], None] = '0ac2941e8a8d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'surgical_blocks',
        sa.Column('is_tissue_uncountable', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('surgical_blocks', 'is_tissue_uncountable')
