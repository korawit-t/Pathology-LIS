"""rename enable_gyne_approve_system to enable_gyne_qc_system

Revision ID: qc001
Revises: tat001
Create Date: 2026-06-27

"""
from typing import Sequence, Union

from alembic import op


revision: str = "qc001"
down_revision: Union[str, None] = "tat001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='system_settings' AND column_name='enable_gyne_approve_system'
            ) THEN
                ALTER TABLE system_settings RENAME COLUMN enable_gyne_approve_system TO enable_gyne_qc_system;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='system_settings' AND column_name='enable_gyne_qc_system'
            ) THEN
                ALTER TABLE system_settings RENAME COLUMN enable_gyne_qc_system TO enable_gyne_approve_system;
            END IF;
        END $$;
    """)
