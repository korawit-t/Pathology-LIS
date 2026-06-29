"""merge heads

Revision ID: fa57e73a0606
Revises: 3ba3565828f5
Create Date: 2026-06-25 22:38:35.911047

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fa57e73a0606'
down_revision: Union[str, Sequence[str], None] = '3ba3565828f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
