"""add assist_pathologist_id to molecular_cases

Revision ID: cccb492b1248
Revises: d58ce869a89a
Create Date: 2026-07-21 22:09:56.750887

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cccb492b1248'
down_revision: Union[str, Sequence[str], None] = 'd58ce869a89a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('molecular_cases', sa.Column('assist_pathologist_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'molecular_cases_assist_pathologist_id_fkey',
        'molecular_cases', 'users',
        ['assist_pathologist_id'], ['id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('molecular_cases_assist_pathologist_id_fkey', 'molecular_cases', type_='foreignkey')
    op.drop_column('molecular_cases', 'assist_pathologist_id')
