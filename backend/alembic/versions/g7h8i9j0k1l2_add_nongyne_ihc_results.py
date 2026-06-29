"""add nongyne ihc results

Revision ID: g7h8i9j0k1l2
Revises: f619a232e479
Create Date: 2026-05-27 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, Sequence[str], None] = 'f619a232e479'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'nongyne_ihc_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('ap_test_id', sa.Integer(), nullable=False),
        sa.Column('selected_option', sa.String(length=200), nullable=True),
        sa.Column('numeric_value', sa.Float(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['ap_test_id'], ['anatomical_pathology_tests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['case_id'], ['nongyne_cytology_cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('case_id', 'ap_test_id', name='_nongyne_ihc_case_marker_uc'),
    )
    op.create_index(op.f('ix_nongyne_ihc_results_id'), 'nongyne_ihc_results', ['id'], unique=False)
    op.create_index(op.f('ix_nongyne_ihc_results_case_id'), 'nongyne_ihc_results', ['case_id'], unique=False)
    op.create_index(op.f('ix_nongyne_ihc_results_ap_test_id'), 'nongyne_ihc_results', ['ap_test_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_nongyne_ihc_results_ap_test_id'), table_name='nongyne_ihc_results')
    op.drop_index(op.f('ix_nongyne_ihc_results_case_id'), table_name='nongyne_ihc_results')
    op.drop_index(op.f('ix_nongyne_ihc_results_id'), table_name='nongyne_ihc_results')
    op.drop_table('nongyne_ihc_results')
