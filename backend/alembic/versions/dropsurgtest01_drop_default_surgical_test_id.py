"""drop unused default_surgical_test_id from system setting

Revision ID: dropsurgtest01
Revises: dropcfgopt01
Create Date: 2026-07-13

Removed because nothing ever applied it as a default test when registering
a surgical case/block — unlike default_gyne_test_id and (now)
default_non_gyne_test_id, there is no auto-create-first-slide equivalent
for surgical to wire it into. The joinedload/name-resolution plumbing that
made it look connected in the settings-page response is removed alongside
it (see app/schemas/system_setting.py, app/crud/system_setting.py,
app/routers/system_setting.py).
"""
from typing import Sequence, Union

from alembic import op


revision: str = "dropsurgtest01"
down_revision: Union[str, None] = "dropcfgopt01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS default_surgical_test_id")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS default_surgical_test_id "
        "INTEGER REFERENCES anatomical_pathology_tests(id)"
    )
