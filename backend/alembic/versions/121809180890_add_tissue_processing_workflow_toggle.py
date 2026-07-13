"""add tissue processing workflow toggle

Revision ID: 121809180890
Revises: 505669ae3ee1
Create Date: 2026-07-13 10:32:45.638753

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '121809180890'
down_revision: Union[str, Sequence[str], None] = '505669ae3ee1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('system_settings', sa.Column('enable_tissue_processing_workflow', sa.Boolean(), server_default='true', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('system_settings', 'enable_tissue_processing_workflow')
