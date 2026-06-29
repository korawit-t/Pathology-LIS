"""add tat days to system setting

Revision ID: tat001
Revises: 57c0f86f4eb6
Create Date: 2026-06-27

"""
from typing import Sequence, Union

from alembic import op


revision: str = "tat001"
down_revision: Union[str, None] = "57c0f86f4eb6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS surgical_tat_days INTEGER DEFAULT 10")
    op.execute("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS non_gyne_tat_days INTEGER DEFAULT 5")
    op.execute("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS gyne_tat_days INTEGER DEFAULT 5")


def downgrade() -> None:
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS gyne_tat_days")
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS non_gyne_tat_days")
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS surgical_tat_days")
