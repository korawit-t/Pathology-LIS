"""add pathologist to slide_block_release

Revision ID: 4a5874af4e12
Revises: b2278f24cf4c
Create Date: 2026-05-14 10:05:33.604789

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a5874af4e12'
down_revision: Union[str, Sequence[str], None] = 'b2278f24cf4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('slide_block_releases', sa.Column('pathologist_id', sa.Integer(), nullable=True))
    op.add_column('slide_block_releases', sa.Column('pathologist_name', sa.String(length=200), nullable=True))
    op.create_foreign_key('fk_sbr_pathologist', 'slide_block_releases', 'users', ['pathologist_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_sbr_pathologist', 'slide_block_releases', type_='foreignkey')
    op.drop_column('slide_block_releases', 'pathologist_name')
    op.drop_column('slide_block_releases', 'pathologist_id')
