"""add gyne qc review fields

Revision ID: m1n2o3p4q5r6
Revises: h2i3j4k5l6m7
Create Date: 2026-05-28 09:00:00.000000

Adds 10% pathologist QC review system:
- gyne_cytology_cases: needs_review, review_reason, reviewed_by_id, reviewed_at
- system_settings: nilm_review_every_n
- users: nilm_since_last_review
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'm1n2o3p4q5r6'
down_revision: Union[str, None] = 'h2i3j4k5l6m7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('gyne_cytology_cases',
        sa.Column('needs_review', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('gyne_cytology_cases',
        sa.Column('review_reason', sa.String(), nullable=True))
    op.add_column('gyne_cytology_cases',
        sa.Column('reviewed_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('gyne_cytology_cases',
        sa.Column('reviewed_at', sa.DateTime(), nullable=True))
    op.create_index('ix_gyne_cytology_cases_needs_review', 'gyne_cytology_cases', ['needs_review'])

    op.add_column('system_settings',
        sa.Column('nilm_review_every_n', sa.Integer(), nullable=False, server_default='10'))

    op.add_column('users',
        sa.Column('nilm_since_last_review', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_index('ix_gyne_cytology_cases_needs_review', table_name='gyne_cytology_cases')
    op.drop_column('gyne_cytology_cases', 'reviewed_at')
    op.drop_column('gyne_cytology_cases', 'reviewed_by_id')
    op.drop_column('gyne_cytology_cases', 'review_reason')
    op.drop_column('gyne_cytology_cases', 'needs_review')

    op.drop_column('system_settings', 'nilm_review_every_n')

    op.drop_column('users', 'nilm_since_last_review')
