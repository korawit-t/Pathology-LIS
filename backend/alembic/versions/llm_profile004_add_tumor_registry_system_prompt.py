"""add tumor_registry_system_prompt to system_settings

Revision ID: llm_profile004
Revises: llm_profile003
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'llm_profile004'
down_revision = 'llm_profile003'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('system_settings', sa.Column('tumor_registry_system_prompt', sa.Text(), nullable=True))
    # drop system_prompt from llm_profiles if it was added by the old llm_profile003
    op.execute("ALTER TABLE llm_profiles DROP COLUMN IF EXISTS system_prompt")


def downgrade():
    op.drop_column('system_settings', 'tumor_registry_system_prompt')
