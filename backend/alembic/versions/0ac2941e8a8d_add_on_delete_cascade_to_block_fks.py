"""add on delete cascade to embedding, sectioning, block_storage block_id FKs

Revision ID: 0ac2941e8a8d
Revises: 9c0988c3f080
Create Date: 2026-05-18 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0ac2941e8a8d'
down_revision: Union[str, Sequence[str], None] = '9c0988c3f080'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # embedding_details
    op.drop_constraint('embedding_details_block_id_fkey', 'embedding_details', type_='foreignkey')
    op.create_foreign_key(
        'embedding_details_block_id_fkey',
        'embedding_details', 'surgical_blocks',
        ['block_id'], ['id'],
        ondelete='CASCADE',
    )

    # sectioning_details
    op.drop_constraint('sectioning_details_block_id_fkey', 'sectioning_details', type_='foreignkey')
    op.create_foreign_key(
        'sectioning_details_block_id_fkey',
        'sectioning_details', 'surgical_blocks',
        ['block_id'], ['id'],
        ondelete='CASCADE',
    )

    # block_storage_details
    op.drop_constraint('block_storage_details_block_id_fkey', 'block_storage_details', type_='foreignkey')
    op.create_foreign_key(
        'block_storage_details_block_id_fkey',
        'block_storage_details', 'surgical_blocks',
        ['block_id'], ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('block_storage_details_block_id_fkey', 'block_storage_details', type_='foreignkey')
    op.create_foreign_key(
        'block_storage_details_block_id_fkey',
        'block_storage_details', 'surgical_blocks',
        ['block_id'], ['id'],
    )

    op.drop_constraint('sectioning_details_block_id_fkey', 'sectioning_details', type_='foreignkey')
    op.create_foreign_key(
        'sectioning_details_block_id_fkey',
        'sectioning_details', 'surgical_blocks',
        ['block_id'], ['id'],
    )

    op.drop_constraint('embedding_details_block_id_fkey', 'embedding_details', type_='foreignkey')
    op.create_foreign_key(
        'embedding_details_block_id_fkey',
        'embedding_details', 'surgical_blocks',
        ['block_id'], ['id'],
    )
