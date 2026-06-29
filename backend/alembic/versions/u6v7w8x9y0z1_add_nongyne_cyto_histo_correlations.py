"""add nongyne cyto histo correlations table

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'u6v7w8x9y0z1'
down_revision = 't5u6v7w8x9y0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'nongyne_cyto_histo_correlations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nongyne_case_id', sa.Integer(), nullable=False),
        sa.Column('surgical_accession_no', sa.String(), nullable=False),
        sa.Column('surgical_case_id', sa.Integer(), nullable=True),
        sa.Column('cytology_diagnosis_snapshot', sa.Text(), nullable=True),
        sa.Column('histology_diagnosis', sa.Text(), nullable=True),
        sa.Column('correlation_result', sa.String(30), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('correlated_by_id', sa.Integer(), nullable=False),
        sa.Column('correlated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['correlated_by_id'], ['users.id']),
        sa.ForeignKeyConstraint(['nongyne_case_id'], ['nongyne_cytology_cases.id']),
        sa.ForeignKeyConstraint(['surgical_case_id'], ['surgical_cases.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_nongyne_cyto_histo_correlations_id', 'nongyne_cyto_histo_correlations', ['id'])
    op.create_index('ix_nongyne_cyto_histo_correlations_nongyne_case_id', 'nongyne_cyto_histo_correlations', ['nongyne_case_id'])
    op.create_index('ix_nongyne_cyto_histo_correlations_surgical_accession_no', 'nongyne_cyto_histo_correlations', ['surgical_accession_no'])
    op.create_index('ix_nongyne_cyto_histo_correlations_surgical_case_id', 'nongyne_cyto_histo_correlations', ['surgical_case_id'])


def downgrade() -> None:
    op.drop_index('ix_nongyne_cyto_histo_correlations_surgical_case_id', table_name='nongyne_cyto_histo_correlations')
    op.drop_index('ix_nongyne_cyto_histo_correlations_surgical_accession_no', table_name='nongyne_cyto_histo_correlations')
    op.drop_index('ix_nongyne_cyto_histo_correlations_nongyne_case_id', table_name='nongyne_cyto_histo_correlations')
    op.drop_index('ix_nongyne_cyto_histo_correlations_id', table_name='nongyne_cyto_histo_correlations')
    op.drop_table('nongyne_cyto_histo_correlations')
