"""add block_templates json to gross_templates

Revision ID: 27ce94e37d39
Revises: 3801d12761cf
Create Date: 2026-05-18 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '27ce94e37d39'
down_revision: Union[str, Sequence[str], None] = '3801d12761cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'gross_templates',
        sa.Column('block_templates', sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('gross_templates', 'block_templates')
