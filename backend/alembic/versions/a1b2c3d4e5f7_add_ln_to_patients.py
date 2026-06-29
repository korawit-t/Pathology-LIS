"""add ln to patients

Revision ID: a1b2c3d4e5f7
Revises: f3a1b2c4d5e6
Create Date: 2026-05-08

"""
from typing import Union, Sequence
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, Sequence[str], None] = 'f3a1b2c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('ln', sa.String(), nullable=True))
    op.create_index('ix_patients_ln', 'patients', ['ln'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_patients_ln', table_name='patients')
    op.drop_column('patients', 'ln')
