"""add his_export_logs table, drop dead his_send tracking columns

Adds a dedicated outbox/delivery-log table for outbound HIS report export
(replaces the unused his_sent_at/his_send_error/his_reference_id/
his_send_retries columns added in 57c0f86f4eb6, which were never wired to
any code — confirmed via repo-wide grep before dropping them here).

A DB patched manually via backend/db/add_his_export_logs_and_drop_dead_columns.sql
needs `alembic stamp head` afterward so this migration doesn't try to re-run.

Revision ID: 505669ae3ee1
Revises: ac7b21e16b03
Create Date: 2026-07-11 23:30:45.807763

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '505669ae3ee1'
down_revision: Union[str, Sequence[str], None] = 'ac7b21e16b03'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'his_export_logs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('resource_type', sa.String(50), nullable=False),
        sa.Column('resource_id', sa.Integer(), nullable=False),
        sa.Column('accession_no', sa.String(50), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('adapter_type', sa.String(50), nullable=True),
        sa.Column('payload_snapshot', sa.JSON(), nullable=True),
        sa.Column('response_snapshot', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('his_reference_id', sa.String(), nullable=True),
        sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_attempts', sa.Integer(), nullable=False, server_default='8'),
        sa.Column('next_attempt_at', sa.DateTime(), nullable=True),
        sa.Column('claimed_at', sa.DateTime(), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('triggered_by', sa.String(20), nullable=False, server_default='auto'),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index(
        'ix_his_export_logs_status_next_attempt',
        'his_export_logs',
        ['status', 'next_attempt_at'],
    )
    op.create_index(
        'ix_his_export_logs_resource',
        'his_export_logs',
        ['resource_type', 'resource_id'],
    )
    op.create_index(
        'ix_his_export_logs_accession_no',
        'his_export_logs',
        ['accession_no'],
    )
    op.create_index(
        'uq_his_export_logs_active_resource',
        'his_export_logs',
        ['resource_type', 'resource_id'],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )

    # --- Drop dead his_send_* tracking columns (never wired to any code) ---
    # IF EXISTS throughout: some deployments' schema history diverged enough
    # (e.g. bootstrapped via create_all() then stamped, rather than replaying
    # every migration) that idx_*_his_sent_at may not actually be present
    # even though the columns are — confirmed on a real dev DB while testing
    # this migration, not a hypothetical.
    for table in ('surgical_reports', 'gyne_cyto_reports', 'nongyne_cyto_reports'):
        op.execute(sa.text(f'DROP INDEX IF EXISTS idx_{table}_his_sent_at'))
        op.execute(sa.text(f'ALTER TABLE {table} DROP COLUMN IF EXISTS his_send_retries'))
        op.execute(sa.text(f'ALTER TABLE {table} DROP COLUMN IF EXISTS his_reference_id'))
        op.execute(sa.text(f'ALTER TABLE {table} DROP COLUMN IF EXISTS his_send_error'))
        op.execute(sa.text(f'ALTER TABLE {table} DROP COLUMN IF EXISTS his_sent_at'))


def downgrade() -> None:
    """Downgrade schema."""
    for table in ('nongyne_cyto_reports', 'gyne_cyto_reports', 'surgical_reports'):
        op.add_column(table, sa.Column('his_sent_at', sa.DateTime(), nullable=True))
        op.add_column(table, sa.Column('his_send_error', sa.Text(), nullable=True))
        op.add_column(table, sa.Column('his_reference_id', sa.String(), nullable=True))
        op.add_column(table, sa.Column('his_send_retries', sa.Integer(), nullable=False, server_default='0'))
        op.create_index(f'idx_{table}_his_sent_at', table, ['his_sent_at'])

    op.drop_index('uq_his_export_logs_active_resource', table_name='his_export_logs')
    op.drop_index('ix_his_export_logs_accession_no', table_name='his_export_logs')
    op.drop_index('ix_his_export_logs_resource', table_name='his_export_logs')
    op.drop_index('ix_his_export_logs_status_next_attempt', table_name='his_export_logs')
    op.drop_table('his_export_logs')
