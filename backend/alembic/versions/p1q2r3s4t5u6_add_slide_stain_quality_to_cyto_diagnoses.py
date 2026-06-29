"""add slide and stain quality to cyto diagnoses

Revision ID: p1q2r3s4t5u6
Revises: o3p4q5r6s7t8
Create Date: 2026-05-28

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'p1q2r3s4t5u6'
down_revision: Union[str, Sequence[str], None] = 'o3p4q5r6s7t8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('gyne_diagnoses', sa.Column('slide_quality', sa.String(20), nullable=True))
    op.add_column('gyne_diagnoses', sa.Column('stain_quality', sa.String(20), nullable=True))
    op.add_column('nongyne_diagnoses', sa.Column('slide_quality', sa.String(20), nullable=True))
    op.add_column('nongyne_diagnoses', sa.Column('stain_quality', sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column('nongyne_diagnoses', 'stain_quality')
    op.drop_column('nongyne_diagnoses', 'slide_quality')
    op.drop_column('gyne_diagnoses', 'stain_quality')
    op.drop_column('gyne_diagnoses', 'slide_quality')
