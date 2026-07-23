"""add scheduled_notification_poll_seconds to system_setting

Revision ID: 773da4e8976c
Revises: 599755f6b01a
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op


revision: str = "773da4e8976c"
down_revision: Union[str, None] = "599755f6b01a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS "
        "scheduled_notification_poll_seconds INTEGER DEFAULT 900"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS scheduled_notification_poll_seconds")
