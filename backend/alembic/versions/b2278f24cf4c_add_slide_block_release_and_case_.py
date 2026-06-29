"""add slide block release and case release flags

Revision ID: b2278f24cf4c
Revises: 595e1920f91d
Create Date: 2026-05-14 00:05:21.979810

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2278f24cf4c'
down_revision: Union[str, Sequence[str], None] = '595e1920f91d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ตาราง slide_block_releases ใหม่
    op.create_table('slide_block_releases',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('release_no', sa.String(length=20), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('case_type', sa.String(length=50), nullable=False),
    sa.Column('release_type', sa.String(length=10), nullable=False),
    sa.Column('recipient_name', sa.String(length=200), nullable=False),
    sa.Column('reference_doc_no', sa.String(length=100), nullable=True),
    sa.Column('remark', sa.Text(), nullable=True),
    sa.Column('released_by_id', sa.Integer(), nullable=False),
    sa.Column('released_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['released_by_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_release_case', 'slide_block_releases', ['case_id', 'case_type'], unique=False)
    op.create_index(op.f('ix_slide_block_releases_case_id'), 'slide_block_releases', ['case_id'], unique=False)
    op.create_index(op.f('ix_slide_block_releases_id'), 'slide_block_releases', ['id'], unique=False)
    op.create_index(op.f('ix_slide_block_releases_release_no'), 'slide_block_releases', ['release_no'], unique=True)

    # columns ใหม่บน case tables
    op.add_column('gyne_cytology_cases', sa.Column('is_slide_released', sa.Boolean(), nullable=True))
    op.create_index(op.f('ix_gyne_cytology_cases_is_slide_released'), 'gyne_cytology_cases', ['is_slide_released'], unique=False)

    op.add_column('nongyne_cytology_cases', sa.Column('is_slide_released', sa.Boolean(), nullable=True))
    op.create_index(op.f('ix_nongyne_cytology_cases_is_slide_released'), 'nongyne_cytology_cases', ['is_slide_released'], unique=False)

    op.add_column('surgical_cases', sa.Column('is_slide_released', sa.Boolean(), nullable=True))
    op.add_column('surgical_cases', sa.Column('is_block_released', sa.Boolean(), nullable=True))
    op.create_index(op.f('ix_surgical_cases_is_block_released'), 'surgical_cases', ['is_block_released'], unique=False)
    op.create_index(op.f('ix_surgical_cases_is_slide_released'), 'surgical_cases', ['is_slide_released'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_surgical_cases_is_slide_released'), table_name='surgical_cases')
    op.drop_index(op.f('ix_surgical_cases_is_block_released'), table_name='surgical_cases')
    op.drop_column('surgical_cases', 'is_block_released')
    op.drop_column('surgical_cases', 'is_slide_released')

    op.drop_index(op.f('ix_nongyne_cytology_cases_is_slide_released'), table_name='nongyne_cytology_cases')
    op.drop_column('nongyne_cytology_cases', 'is_slide_released')

    op.drop_index(op.f('ix_gyne_cytology_cases_is_slide_released'), table_name='gyne_cytology_cases')
    op.drop_column('gyne_cytology_cases', 'is_slide_released')

    op.drop_index(op.f('ix_slide_block_releases_release_no'), table_name='slide_block_releases')
    op.drop_index(op.f('ix_slide_block_releases_id'), table_name='slide_block_releases')
    op.drop_index(op.f('ix_slide_block_releases_case_id'), table_name='slide_block_releases')
    op.drop_index('idx_release_case', table_name='slide_block_releases')
    op.drop_table('slide_block_releases')
