"""add gyne review_result and review_note

Revision ID: n2o3p4q5r6s7
Revises: m1n2o3p4q5r6
Create Date: 2026-05-28 11:00:00.000000

Adds agree/disagree result tracking for 10% pathologist QC review.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'n2o3p4q5r6s7'
down_revision: Union[str, None] = 'm1n2o3p4q5r6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('gyne_cytology_cases',
        sa.Column('review_result', sa.String(), nullable=True))
    op.add_column('gyne_cytology_cases',
        sa.Column('review_note', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('gyne_cytology_cases', 'review_note')
    op.drop_column('gyne_cytology_cases', 'review_result')
