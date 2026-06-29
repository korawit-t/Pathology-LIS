"""add report_primary_color to system_settings

Revision ID: 06dfbf0d9f03
Revises: f97e6c1a547c
Create Date: 2026-05-25 16:18:14.266762

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '06dfbf0d9f03'
down_revision: Union[str, Sequence[str], None] = 'f97e6c1a547c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('system_settings', sa.Column('report_primary_color', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('system_settings', 'report_primary_color')
