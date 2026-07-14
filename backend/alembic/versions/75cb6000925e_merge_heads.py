"""merge heads

Revision ID: 75cb6000925e
Revises: 121809180890, dropsurgtest01
Create Date: 2026-07-14 14:19:34.972904

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '75cb6000925e'
down_revision: Union[str, Sequence[str], None] = ('121809180890', 'dropsurgtest01')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
