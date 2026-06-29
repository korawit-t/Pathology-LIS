"""add gyne nongyne request files

Revision ID: f619a232e479
Revises: x9w8v7u6t5s4
Create Date: 2026-05-27 14:30:27.294183

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f619a232e479'
down_revision: Union[str, Sequence[str], None] = 'x9w8v7u6t5s4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('gyne_cyto_request_files',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('file_path', sa.String(), nullable=False),
    sa.Column('file_name', sa.String(), nullable=False),
    sa.Column('file_type', sa.String(), nullable=False),
    sa.Column('uploaded_at', sa.DateTime(), nullable=True),
    sa.Column('uploaded_by_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['gyne_cytology_cases.id'], ),
    sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_gyne_cyto_request_files_case_id'), 'gyne_cyto_request_files', ['case_id'], unique=False)
    op.create_index(op.f('ix_gyne_cyto_request_files_id'), 'gyne_cyto_request_files', ['id'], unique=False)
    op.create_table('nongyne_request_files',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('case_id', sa.Integer(), nullable=False),
    sa.Column('file_path', sa.String(), nullable=False),
    sa.Column('file_name', sa.String(), nullable=False),
    sa.Column('file_type', sa.String(), nullable=False),
    sa.Column('uploaded_at', sa.DateTime(), nullable=True),
    sa.Column('uploaded_by_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['nongyne_cytology_cases.id'], ),
    sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_nongyne_request_files_case_id'), 'nongyne_request_files', ['case_id'], unique=False)
    op.create_index(op.f('ix_nongyne_request_files_id'), 'nongyne_request_files', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_nongyne_request_files_id'), table_name='nongyne_request_files')
    op.drop_index(op.f('ix_nongyne_request_files_case_id'), table_name='nongyne_request_files')
    op.drop_table('nongyne_request_files')
    op.drop_index(op.f('ix_gyne_cyto_request_files_id'), table_name='gyne_cyto_request_files')
    op.drop_index(op.f('ix_gyne_cyto_request_files_case_id'), table_name='gyne_cyto_request_files')
    op.drop_table('gyne_cyto_request_files')
