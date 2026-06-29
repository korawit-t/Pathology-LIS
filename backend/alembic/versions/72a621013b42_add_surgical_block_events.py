"""add surgical_block_events

Revision ID: 72a621013b42
Revises: a2b3c4d5e6f7
Create Date: 2026-05-18 10:43:53.859147

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '72a621013b42'
down_revision: Union[str, Sequence[str], None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'surgical_block_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('block_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('location', sa.String(length=200), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('performed_by_id', sa.Integer(), nullable=False),
        sa.Column('event_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['block_id'], ['surgical_blocks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['performed_by_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_surgical_block_events_id', 'surgical_block_events', ['id'], unique=False)
    op.create_index('ix_surgical_block_events_block_id', 'surgical_block_events', ['block_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_surgical_block_events_block_id', table_name='surgical_block_events')
    op.drop_index('ix_surgical_block_events_id', table_name='surgical_block_events')
    op.drop_table('surgical_block_events')
