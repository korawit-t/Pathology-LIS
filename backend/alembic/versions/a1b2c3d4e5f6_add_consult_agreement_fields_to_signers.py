"""add consult_note and agreement fields to signer tables

Revision ID: p9q8r7s6t5u4
Revises: z9y8x7w6v5u4
Create Date: 2026-05-24

"""
from alembic import op
import sqlalchemy as sa

revision = "p9q8r7s6t5u4"
down_revision = "z9y8x7w6v5u4"
branch_labels = None
depends_on = None


def upgrade():
    # report_signers (surgical) — add agreement + consult_note
    with op.batch_alter_table("report_signers") as batch_op:
        batch_op.add_column(sa.Column("consult_note", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("agreement", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("agreement_note", sa.Text(), nullable=True))

    # gyne_report_signers — add consult_note
    with op.batch_alter_table("gyne_report_signers") as batch_op:
        batch_op.add_column(sa.Column("consult_note", sa.Text(), nullable=True))

    # nongyne_report_signers — add consult_note
    with op.batch_alter_table("nongyne_report_signers") as batch_op:
        batch_op.add_column(sa.Column("consult_note", sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table("report_signers") as batch_op:
        batch_op.drop_column("agreement_note")
        batch_op.drop_column("agreement")
        batch_op.drop_column("consult_note")

    with op.batch_alter_table("gyne_report_signers") as batch_op:
        batch_op.drop_column("consult_note")

    with op.batch_alter_table("nongyne_report_signers") as batch_op:
        batch_op.drop_column("consult_note")
