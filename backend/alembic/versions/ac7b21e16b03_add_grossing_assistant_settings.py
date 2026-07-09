"""add grossing assistant settings

Revision ID: ac7b21e16b03
Revises: b3bdaa146d7c
Create Date: 2026-07-09 09:58:33.157384

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ac7b21e16b03'
down_revision: Union[str, Sequence[str], None] = 'b3bdaa146d7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('system_settings', sa.Column('grossing_assist_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('system_settings', sa.Column('grossing_assist_llm_profile_id', sa.Integer(), nullable=True))
    op.add_column('system_settings', sa.Column('grossing_assist_system_prompt', sa.Text(), nullable=True))
    op.create_foreign_key(None, 'system_settings', 'llm_profiles', ['grossing_assist_llm_profile_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, 'system_settings', type_='foreignkey')
    op.drop_column('system_settings', 'grossing_assist_system_prompt')
    op.drop_column('system_settings', 'grossing_assist_llm_profile_id')
    op.drop_column('system_settings', 'grossing_assist_enabled')
