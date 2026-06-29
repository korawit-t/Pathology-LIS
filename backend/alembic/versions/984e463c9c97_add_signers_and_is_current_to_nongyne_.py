"""add signers and is_current to nongyne_diagnoses

Revision ID: 984e463c9c97
Revises: 06dfbf0d9f03
Create Date: 2026-05-25 21:54:25.969591

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '984e463c9c97'
down_revision: Union[str, Sequence[str], None] = '06dfbf0d9f03'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy.dialects import postgresql
    op.add_column('nongyne_diagnoses', sa.Column('is_current', sa.Boolean(), nullable=True, server_default='true'))
    op.add_column('nongyne_diagnoses', sa.Column('signers', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.create_index('ix_nongyne_diagnoses_is_current', 'nongyne_diagnoses', ['is_current'])


def downgrade() -> None:
    op.drop_index('ix_nongyne_diagnoses_is_current', table_name='nongyne_diagnoses')
    op.drop_column('nongyne_diagnoses', 'signers')
    op.drop_column('nongyne_diagnoses', 'is_current')
