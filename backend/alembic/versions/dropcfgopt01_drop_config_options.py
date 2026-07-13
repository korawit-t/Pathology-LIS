"""drop unused config_options from system setting

Revision ID: dropcfgopt01
Revises: dropaccfmt01
Create Date: 2026-07-13

Removed because it was never read anywhere — a JSON catch-all reserved for
future settings that no code ever wrote a key into or read a key out of,
and with no admin UI ever exposing it.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "dropcfgopt01"
down_revision: Union[str, None] = "dropaccfmt01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS config_options")


def downgrade() -> None:
    op.execute("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS config_options JSON")
