"""add hosxp keyed flag to surgical block stains

Revision ID: 5f7b8f95552c
Revises: ec9625fd6847
Create Date: 2026-08-14 11:29:51.019337

Internal stains had nowhere to record whether they had been keyed into HosXP —
the outlab flow stores that on surgical_outlab_run_details, which only exists
once slides are dispatched. These two columns are the internal equivalent.

Note: --autogenerate also produced unrelated drift for this revision
(scheduled_notification_rules column comments, a unique-constraint rename, and
a DROP of ix_outlab_run_details_unkeyed — a partial index autogenerate cannot
introspect and therefore believes is absent from the models). All of that was
removed by hand; dropping that index in particular would have been a silent
production regression.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5f7b8f95552c'
down_revision: Union[str, Sequence[str], None] = 'ec9625fd6847'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default is required: the table has existing rows, and a NOT NULL
    # column without one fails the backfill.
    op.add_column(
        'surgical_block_stains',
        sa.Column('is_hosxp_keyed', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'surgical_block_stains',
        sa.Column('hosxp_keyed_at', sa.DateTime(), nullable=True),
    )
    # Mirrors ix_outlab_run_details_unkeyed — the HosXP tab's default view is
    # "not yet keyed", so index only those rows.
    op.create_index(
        'ix_block_stains_unkeyed',
        'surgical_block_stains',
        ['id'],
        unique=False,
        postgresql_where=sa.text('is_hosxp_keyed = false'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_block_stains_unkeyed', table_name='surgical_block_stains')
    op.drop_column('surgical_block_stains', 'hosxp_keyed_at')
    op.drop_column('surgical_block_stains', 'is_hosxp_keyed')
