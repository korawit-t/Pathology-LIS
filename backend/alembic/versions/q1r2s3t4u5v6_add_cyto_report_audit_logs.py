"""add cyto_report_audit_logs table

Revision ID: q1r2s3t4u5v6
Revises: p9q8r7s6t5u4
Create Date: 2026-05-24

"""
from alembic import op
import sqlalchemy as sa

revision = "q1r2s3t4u5v6"
down_revision = "p9q8r7s6t5u4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cyto_report_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("report_type", sa.String(), nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False, index=True),
        sa.Column("approver_id", sa.Integer(), nullable=False),
        sa.Column("approver_name", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("cyto_report_audit_logs")
