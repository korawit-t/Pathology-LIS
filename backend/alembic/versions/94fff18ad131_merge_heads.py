"""merge_heads

Revision ID: 94fff18ad131
Revises: 2ee62ca78510, a1b2c3d4e5f7
Create Date: 2026-05-08 11:50:51.434925

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '94fff18ad131'
down_revision: Union[str, Sequence[str], None] = ('2ee62ca78510', 'a1b2c3d4e5f7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
