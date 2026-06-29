"""merge

Revision ID: afbe78bdbd0d
Revises: ee1bd1d96806
Create Date: 2026-06-26 15:08:18.167518

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'afbe78bdbd0d'
down_revision: Union[str, Sequence[str], None] = 'ee1bd1d96806'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
