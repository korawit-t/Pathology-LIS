"""merge all heads

Revision ID: 98c35d1d21ad
Revises: d1b84dda496e, fa57e73a0606
Create Date: 2026-06-25 22:45:31.043792

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '98c35d1d21ad'
down_revision: Union[str, Sequence[str], None] = ('d1b84dda496e', 'fa57e73a0606')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
