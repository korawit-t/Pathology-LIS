"""create tumor_registries table

Revision ID: tumor_reg001
Revises: tumor00001
Create Date: 2026-06-24

"""
from alembic import op
import sqlalchemy as sa
from typing import Sequence, Union

revision: str = 'tumor_reg001'
down_revision: Union[str, Sequence[str], None] = 'tumor00001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'tumor_registries',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('surgical_case_id', sa.Integer(), sa.ForeignKey('surgical_cases.id'), nullable=False),
        sa.Column('topography_code', sa.String(), nullable=True),
        sa.Column('topography_desc', sa.String(), nullable=True),
        sa.Column('morphology_code', sa.String(), nullable=True),
        sa.Column('morphology_desc', sa.String(), nullable=True),
        sa.Column('grade', sa.String(), nullable=True),
        sa.Column('pt', sa.String(), nullable=True),
        sa.Column('pn', sa.String(), nullable=True),
        sa.Column('pm', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
    )
    op.create_index('idx_tumor_registry_case', 'tumor_registries', ['surgical_case_id'], unique=True)


def downgrade() -> None:
    op.drop_index('idx_tumor_registry_case', table_name='tumor_registries')
    op.drop_table('tumor_registries')
