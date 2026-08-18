"""add quality_comment to surgical, gyne and nongyne cases

Revision ID: cb12a249b9b0
Revises: cbf87c42dd0b
Create Date: 2026-08-18 10:12:49.078143

Autogenerate also picked up pre-existing drift unrelated to this change
(column comments on scheduled_notification_rules, a unique-constraint rename
on scheduled_notification_states, and the partial `*_unkeyed` indexes on
surgical_block_stains / surgical_outlab_run_details). Those were stripped —
this revision only adds the three quality_comment columns.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'cb12a249b9b0'
down_revision: Union[str, Sequence[str], None] = 'cbf87c42dd0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('surgical_cases', sa.Column('quality_comment', sa.Text(), nullable=True))
    op.add_column('gyne_cytology_cases', sa.Column('quality_comment', sa.Text(), nullable=True))
    op.add_column('nongyne_cytology_cases', sa.Column('quality_comment', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('nongyne_cytology_cases', 'quality_comment')
    op.drop_column('gyne_cytology_cases', 'quality_comment')
    op.drop_column('surgical_cases', 'quality_comment')
