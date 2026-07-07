"""add use_custom_report_header to hospitals

Revision ID: 41e9315daf78
Revises: user_hosp001
Create Date: 2026-07-07 13:34:34.916327

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '41e9315daf78'
down_revision: Union[str, Sequence[str], None] = 'user_hosp001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'hospitals',
        sa.Column('use_custom_report_header', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column('hospitals', 'use_custom_report_header', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('hospitals', 'use_custom_report_header')
