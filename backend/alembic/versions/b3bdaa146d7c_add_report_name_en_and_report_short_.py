"""add report_name_en and report_short_name_en to hospitals

Revision ID: b3bdaa146d7c
Revises: 41e9315daf78
Create Date: 2026-07-07 15:18:49.155331

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3bdaa146d7c'
down_revision: Union[str, Sequence[str], None] = '41e9315daf78'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('hospitals', sa.Column('report_name_en', sa.String(), nullable=True))
    op.add_column('hospitals', sa.Column('report_short_name_en', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('hospitals', 'report_short_name_en')
    op.drop_column('hospitals', 'report_name_en')
