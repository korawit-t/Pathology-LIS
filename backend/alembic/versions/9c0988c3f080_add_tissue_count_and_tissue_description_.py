"""add tissue_count and tissue_description to surgical_blocks

Revision ID: 9c0988c3f080
Revises: aac48a8f9259
Create Date: 2026-05-18 14:30:21.096965

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9c0988c3f080'
down_revision: Union[str, Sequence[str], None] = 'aac48a8f9259'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('surgical_blocks', sa.Column('tissue_count', sa.Integer(), nullable=True))
    op.add_column('surgical_blocks', sa.Column('tissue_description', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('surgical_blocks', 'tissue_description')
    op.drop_column('surgical_blocks', 'tissue_count')
