"""add internal_consults table

Revision ID: a1b2c3d4e5f6
Revises: z9y8x7w6v5u4
Create Date: 2026-06-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'z9y8x7w6v5u4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'internal_consults',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_type', sa.String(), nullable=False),
        sa.Column('report_id', sa.Integer(), nullable=False),
        sa.Column('requester_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('consultant_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('opinion', sa.Text(), nullable=True),
        sa.Column('accession_no_snapshot', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('promoted_to_signer', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_internal_consults_id', 'internal_consults', ['id'])
    op.create_index('ix_internal_consults_consultant_status', 'internal_consults', ['consultant_id', 'status'])
    op.create_index('ix_internal_consults_case_type_report', 'internal_consults', ['case_type', 'report_id'])
    op.create_index('ix_internal_consults_requester_id', 'internal_consults', ['requester_id'])


def downgrade():
    op.drop_index('ix_internal_consults_requester_id', table_name='internal_consults')
    op.drop_index('ix_internal_consults_case_type_report', table_name='internal_consults')
    op.drop_index('ix_internal_consults_consultant_status', table_name='internal_consults')
    op.drop_index('ix_internal_consults_id', table_name='internal_consults')
    op.drop_table('internal_consults')
