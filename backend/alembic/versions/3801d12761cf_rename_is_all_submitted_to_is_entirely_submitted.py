"""rename is_all_submitted to is_entirely_submitted on surgical_specimens

Revision ID: 3801d12761cf
Revises: b5aefe4e5442
Create Date: 2026-05-18 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '3801d12761cf'
down_revision: Union[str, Sequence[str], None] = 'b5aefe4e5442'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('surgical_specimens', 'is_all_submitted', new_column_name='is_entirely_submitted')


def downgrade() -> None:
    op.alter_column('surgical_specimens', 'is_entirely_submitted', new_column_name='is_all_submitted')
