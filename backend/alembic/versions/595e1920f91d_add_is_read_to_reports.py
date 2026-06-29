"""add_is_read_to_reports

Revision ID: 595e1920f91d
Revises: 03fec3d8615d
Create Date: 2026-05-12 11:48:17.150607

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '595e1920f91d'
down_revision: Union[str, Sequence[str], None] = '03fec3d8615d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('surgical_reports', sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('surgical_reports', sa.Column('read_at', sa.DateTime(), nullable=True))
    op.add_column('gyne_cyto_reports', sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('gyne_cyto_reports', sa.Column('read_at', sa.DateTime(), nullable=True))
    op.add_column('nongyne_cyto_reports', sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('nongyne_cyto_reports', sa.Column('read_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('nongyne_cyto_reports', 'read_at')
    op.drop_column('nongyne_cyto_reports', 'is_read')
    op.drop_column('gyne_cyto_reports', 'read_at')
    op.drop_column('gyne_cyto_reports', 'is_read')
    op.drop_column('surgical_reports', 'read_at')
    op.drop_column('surgical_reports', 'is_read')
