"""add ct screening fields

Revision ID: h2i3j4k5l6m7
Revises: g7h8i9j0k1l2
Create Date: 2026-05-27 16:00:00.000000

NOTE: This migration was applied to the DB but the file was accidentally lost.
All columns already exist in the database — upgrade/downgrade are intentionally empty.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'h2i3j4k5l6m7'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
