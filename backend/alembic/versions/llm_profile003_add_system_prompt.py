"""add tumor_registry_system_prompt to system_settings

Revision ID: llm_profile003
Revises: llm_profile002
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'llm_profile003'
down_revision = 'llm_profile002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('system_settings', sa.Column('tumor_registry_system_prompt', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('system_settings', 'tumor_registry_system_prompt')
