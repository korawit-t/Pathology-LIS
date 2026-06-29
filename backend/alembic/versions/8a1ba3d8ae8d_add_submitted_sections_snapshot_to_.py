"""add submitted_sections_snapshot to surgical_reports

Revision ID: 8a1ba3d8ae8d
Revises: 27ce94e37d39
Create Date: 2026-05-19 11:26:47.487073

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a1ba3d8ae8d'
down_revision: Union[str, Sequence[str], None] = '27ce94e37d39'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('surgical_reports', sa.Column('submitted_sections_snapshot', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('surgical_reports', 'submitted_sections_snapshot')
