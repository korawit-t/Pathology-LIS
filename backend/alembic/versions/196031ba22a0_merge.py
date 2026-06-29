"""merge

Revision ID: 196031ba22a0
Revises: 70d04d351ee6
Create Date: 2026-06-27 22:55:35.507998

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '196031ba22a0'
down_revision: Union[str, Sequence[str], None] = '70d04d351ee6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
