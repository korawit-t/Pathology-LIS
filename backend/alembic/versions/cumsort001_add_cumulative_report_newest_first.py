"""add cumulative_report_newest_first to system setting

Revision ID: cumsort001
Revises: 505669ae3ee1
Create Date: 2026-07-13

"""
from typing import Sequence, Union

from alembic import op


revision: str = "cumsort001"
down_revision: Union[str, None] = "505669ae3ee1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS cumulative_report_newest_first BOOLEAN NOT NULL DEFAULT TRUE"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS cumulative_report_newest_first")
