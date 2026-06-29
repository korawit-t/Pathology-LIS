"""add_nongyne_case_images_table

Revision ID: 03fec3d8615d
Revises: abb321ac60e2
Create Date: 2026-05-08 21:22:45.190383

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '03fec3d8615d'
down_revision: Union[str, Sequence[str], None] = 'abb321ac60e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('nongyne_case_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('image_url', sa.String(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('show_in_report', sa.Boolean(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['case_id'], ['nongyne_cytology_cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_nongyne_case_images_case_id'), 'nongyne_case_images', ['case_id'], unique=False)
    op.create_index(op.f('ix_nongyne_case_images_id'), 'nongyne_case_images', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_nongyne_case_images_id'), table_name='nongyne_case_images')
    op.drop_index(op.f('ix_nongyne_case_images_case_id'), table_name='nongyne_case_images')
    op.drop_table('nongyne_case_images')
