"""merge

Revision ID: 8e27b8b931bf
Revises: b802d0d2203a
Create Date: 2026-06-25 11:46:29.119878

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8e27b8b931bf'
down_revision: Union[str, Sequence[str], None] = 'b802d0d2203a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
