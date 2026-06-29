"""Add gyne_stain_id and nongyne_stain_id to slide_storage_details

Revision ID: c9d0e1f2a3b4
Revises: 4a5874af4e12, a1b2c3d4e5f6
Create Date: 2026-05-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = ('4a5874af4e12', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('slide_storage_details',
        sa.Column('gyne_stain_id', sa.Integer(), sa.ForeignKey('gyne_cyto_stains.id', ondelete='CASCADE'), nullable=True))
    op.add_column('slide_storage_details',
        sa.Column('nongyne_stain_id', sa.Integer(), sa.ForeignKey('nongyne_cyto_stains.id', ondelete='CASCADE'), nullable=True))


def downgrade() -> None:
    op.drop_column('slide_storage_details', 'nongyne_stain_id')
    op.drop_column('slide_storage_details', 'gyne_stain_id')
