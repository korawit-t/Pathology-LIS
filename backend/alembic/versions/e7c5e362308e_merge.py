"""merge

Revision ID: e7c5e362308e
Revises: b2c3d4
Create Date: 2026-06-25 09:58:32.824054

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7c5e362308e'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
