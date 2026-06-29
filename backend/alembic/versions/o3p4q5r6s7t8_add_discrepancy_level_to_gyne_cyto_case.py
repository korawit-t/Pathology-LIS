"""add discrepancy_level to gyne_cytology_cases

Revision ID: o3p4q5r6s7t8
Revises: n2o3p4q5r6s7
Create Date: 2026-05-28 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'o3p4q5r6s7t8'
down_revision: Union[str, None] = 'n2o3p4q5r6s7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'gyne_cytology_cases',
        sa.Column('discrepancy_level', sa.String(), nullable=True, comment='minor | major'),
    )


def downgrade() -> None:
    op.drop_column('gyne_cytology_cases', 'discrepancy_level')
