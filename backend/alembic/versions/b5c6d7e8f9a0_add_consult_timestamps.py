"""add consult timestamps to surgical_cases and outlab_consult_run_details

Revision ID: b5c6d7e8f9a0
Revises: a3b4c5d6e7f8
Create Date: 2026-05-26

"""
from alembic import op
import sqlalchemy as sa

revision = 'b5c6d7e8f9a0'
down_revision = 'a3b4c5d6e7f8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('surgical_cases', sa.Column('consult_report_out_at', sa.DateTime(), nullable=True))
    op.add_column('surgical_cases', sa.Column('consult_pdf_received_at', sa.DateTime(), nullable=True))
    op.add_column('outlab_consult_run_details', sa.Column('report_out_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('outlab_consult_run_details', 'report_out_at')
    op.drop_column('surgical_cases', 'consult_pdf_received_at')
    op.drop_column('surgical_cases', 'consult_report_out_at')
