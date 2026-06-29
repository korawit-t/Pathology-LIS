"""add tumor_registry_llm_profile_id to system_settings

Revision ID: llm_profile002
Revises: llm_profile001
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'llm_profile002'
down_revision = 'llm_profile001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'system_settings',
        sa.Column('tumor_registry_llm_profile_id', sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        'fk_system_settings_tumor_registry_llm_profile',
        'system_settings', 'llm_profiles',
        ['tumor_registry_llm_profile_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint('fk_system_settings_tumor_registry_llm_profile', 'system_settings', type_='foreignkey')
    op.drop_column('system_settings', 'tumor_registry_llm_profile_id')
