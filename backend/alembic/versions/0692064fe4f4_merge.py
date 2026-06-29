"""merge

Revision ID: 0692064fe4f4
Revises: 9ad34352d322
Create Date: 2026-06-25 22:19:56.701664

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0692064fe4f4'
down_revision: Union[str, Sequence[str], None] = '9ad34352d322'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
