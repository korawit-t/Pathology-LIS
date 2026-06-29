"""add outlab_report_pdf_path to gyne_cytology_cases

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa

revision = 's4t5u6v7w8x9'
down_revision = 'r3s4t5u6v7w8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('gyne_cytology_cases',
        sa.Column('outlab_report_pdf_path', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('gyne_cytology_cases', 'outlab_report_pdf_path')
