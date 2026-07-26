"""replace scheduled_notification_poll_seconds with scheduled_notification_times

Switches the scheduled_notifications worker's scheduling model from a fixed
poll interval (seconds) to a list of specific admin-configurable times of
day (HH:MM, Asia/Bangkok) the worker wakes up and evaluates active rules —
e.g. aligned with clinic session times, defaulting to 09:00/11:00/13:00/15:00.

Revision ID: 0339a2dad230
Revises: 8aa0840a8dea
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op


revision: str = "0339a2dad230"
down_revision: Union[str, None] = "8aa0840a8dea"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS scheduled_notification_poll_seconds")
    op.execute(
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS scheduled_notification_times "
        "JSON DEFAULT '[\"09:00\", \"11:00\", \"13:00\", \"15:00\"]'::json"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS scheduled_notification_times")
    op.execute("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS scheduled_notification_poll_seconds INTEGER DEFAULT 900")
