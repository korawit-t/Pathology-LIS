"""add_specimen_complexity_to_anatomical_tests

Revision ID: ed9a0f0ee064
Revises: 8a1ba3d8ae8d
Create Date: 2026-05-20 00:48:52.789631

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ed9a0f0ee064'
down_revision: Union[str, Sequence[str], None] = '8a1ba3d8ae8d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('anatomical_pathology_tests', sa.Column('specimen_complexity', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('anatomical_pathology_tests', 'specimen_complexity')
