"""merge report_templates and cyto_audit_logs heads

Revision ID: f97e6c1a547c
Revises: b2c3d4e5f6a1, q1r2s3t4u5v6
Create Date: 2026-05-25 15:40:49.181244

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f97e6c1a547c'
down_revision: Union[str, Sequence[str], None] = ('b2c3d4e5f6a1', 'q1r2s3t4u5v6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
