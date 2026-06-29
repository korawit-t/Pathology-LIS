"""create llm_profiles and drop llm columns from system_settings

Revision ID: llm_profile001
Revises: tumor_reg001
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'llm_profile001'
down_revision = 'tumor_reg001'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('system_settings', 'llm_provider')
    op.drop_column('system_settings', 'llm_model')
    op.drop_column('system_settings', 'llm_base_url')

    op.create_table(
        'llm_profiles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('display_name', sa.String(), nullable=False),
        sa.Column('provider', sa.String(), nullable=False, server_default='openai'),
        sa.Column('model', sa.String(), nullable=False),
        sa.Column('base_url', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade():
    op.drop_table('llm_profiles')
    op.add_column('system_settings', sa.Column('llm_provider', sa.String(), nullable=True, server_default='openai'))
    op.add_column('system_settings', sa.Column('llm_model', sa.String(), nullable=True, server_default='gpt-4o-mini'))
    op.add_column('system_settings', sa.Column('llm_base_url', sa.String(), nullable=True))
