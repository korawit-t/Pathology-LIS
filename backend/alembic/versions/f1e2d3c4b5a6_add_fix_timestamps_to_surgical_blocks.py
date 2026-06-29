"""add fix timestamps to surgical blocks

Revision ID: f1e2d3c4b5a6
Revises: x1y2z6
Create Date: 2026-06-11

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f1e2d3c4b5a6'
down_revision: Union[str, Sequence[str], None] = 'x1y2z6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('surgical_blocks', sa.Column('fix_start_at', sa.DateTime(), nullable=True))
    op.add_column('surgical_blocks', sa.Column('fix_start_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('surgical_blocks', sa.Column('fix_end_at', sa.DateTime(), nullable=True))
    op.add_column('surgical_blocks', sa.Column('fix_end_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))


def downgrade() -> None:
    op.drop_column('surgical_blocks', 'fix_end_by_id')
    op.drop_column('surgical_blocks', 'fix_end_at')
    op.drop_column('surgical_blocks', 'fix_start_by_id')
    op.drop_column('surgical_blocks', 'fix_start_at')
