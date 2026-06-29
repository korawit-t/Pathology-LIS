"""add gyne correlation support to cyto histo correlations

Revision ID: v7w8x9y0z1a2
Revises: u6v7w8x9y0z1
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'v7w8x9y0z1a2'
down_revision = 'u6v7w8x9y0z1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('nongyne_cyto_histo_correlations', 'nongyne_case_id', nullable=True)
    op.add_column('nongyne_cyto_histo_correlations',
        sa.Column('gyne_case_id', sa.Integer(), nullable=True))
    op.add_column('nongyne_cyto_histo_correlations',
        sa.Column('case_type', sa.String(10), nullable=False, server_default='nongyne'))
    op.create_foreign_key(
        'fk_nongyne_cyto_histo_correlations_gyne_case_id',
        'nongyne_cyto_histo_correlations', 'gyne_cytology_cases',
        ['gyne_case_id'], ['id'])
    op.create_index(
        'ix_nongyne_cyto_histo_correlations_gyne_case_id',
        'nongyne_cyto_histo_correlations', ['gyne_case_id'])


def downgrade() -> None:
    op.drop_index('ix_nongyne_cyto_histo_correlations_gyne_case_id',
        table_name='nongyne_cyto_histo_correlations')
    op.drop_constraint('fk_nongyne_cyto_histo_correlations_gyne_case_id',
        'nongyne_cyto_histo_correlations', type_='foreignkey')
    op.drop_column('nongyne_cyto_histo_correlations', 'case_type')
    op.drop_column('nongyne_cyto_histo_correlations', 'gyne_case_id')
    op.alter_column('nongyne_cyto_histo_correlations', 'nongyne_case_id', nullable=False)
