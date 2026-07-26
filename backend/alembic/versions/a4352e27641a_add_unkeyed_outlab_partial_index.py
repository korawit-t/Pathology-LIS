"""add partial index on surgical_outlab_run_details.is_hosxp_keyed

Both the scheduled_notifications worker and the Today's Patients tab's
pending-by-hn endpoint filter surgical_outlab_run_details WHERE
is_hosxp_keyed = false on every call. A plain index isn't useful for a
low-cardinality boolean, but a partial index scoped to the still-pending
rows lets Postgres seek straight to the (small, bounded) active set instead
of scanning the whole table as it grows.

Revision ID: a4352e27641a
Revises: 0339a2dad230
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op


revision: str = "a4352e27641a"
down_revision: Union[str, None] = "0339a2dad230"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_outlab_run_details_unkeyed "
        "ON surgical_outlab_run_details (id) WHERE is_hosxp_keyed = false"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_outlab_run_details_unkeyed")
