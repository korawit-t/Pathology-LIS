"""drop nilm_since_last_review from users

Revision ID: w8x9y0z1a2b3
Revises: v7w8x9y0z1a2
Create Date: 2026-06-05

Remove counter-based NILM QC sampling column — replaced with true random sampling.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'w8x9y0z1a2b3'
down_revision: Union[str, None] = 'v7w8x9y0z1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('users', 'nilm_since_last_review')


def downgrade() -> None:
    op.add_column('users',
        sa.Column('nilm_since_last_review', sa.Integer(), nullable=False, server_default='0'))
