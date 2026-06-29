"""merge_heads

Revision ID: 576a937a0ccf
Revises: a1b2c3d4, lockout000001, outlabapt0001, nullable00001, tracking00001, a2b3c4, b3c4d5e6f7a8, f1e2d3c4b5a6
Create Date: 2026-06-19 02:32:51.665436

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '576a937a0ccf'
down_revision: Union[str, Sequence[str], None] = ('a1b2c3d4', 'lockout000001', 'outlabapt0001', 'nullable00001', 'tracking00001', 'a2b3c4', 'b3c4d5e6f7a8', 'f1e2d3c4b5a6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
