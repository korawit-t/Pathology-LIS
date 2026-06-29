"""add ai registry settings to system_settings

Revision ID: tumor00001
Revises: a1b2c3d4, a1b2c3d4e5
Create Date: 2026-06-24

"""
from alembic import op
import sqlalchemy as sa
from typing import Sequence, Union

revision: str = 'tumor00001'
down_revision: Union[str, Sequence[str], None] = ('a1b2c3d4', 'a1b2c3d4e5')
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('system_settings', sa.Column('tumor_registry_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('system_settings', sa.Column('llm_provider', sa.String(), nullable=True))
    op.add_column('system_settings', sa.Column('llm_model', sa.String(), nullable=True))
    op.add_column('system_settings', sa.Column('llm_base_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('system_settings', 'llm_base_url')
    op.drop_column('system_settings', 'llm_model')
    op.drop_column('system_settings', 'llm_provider')
    op.drop_column('system_settings', 'tumor_registry_enabled')
