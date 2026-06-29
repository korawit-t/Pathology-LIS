"""merge

Revision ID: 70d04d351ee6
Revises: qc001, rose001
Create Date: 2026-06-27 22:54:28.997727

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '70d04d351ee6'
down_revision: Union[str, Sequence[str], None] = ('qc001', 'rose001')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
