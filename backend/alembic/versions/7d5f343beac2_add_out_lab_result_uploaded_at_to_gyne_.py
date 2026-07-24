"""add out lab result uploaded at to gyne cytology case

Revision ID: 7d5f343beac2
Revises: a4352e27641a
Create Date: 2026-07-24 09:59:35.162520

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d5f343beac2'
down_revision: Union[str, Sequence[str], None] = 'a4352e27641a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('gyne_cytology_cases', sa.Column('out_lab_result_uploaded_at', sa.DateTime(), nullable=True))

    # Backfill: the exact original upload time isn't recoverable, but
    # updated_at was bumped by the same write that set out_lab_result_pdf_path
    # (see update_gyne_case), so it's the closest available approximation for
    # cases uploaded before this column existed.
    op.execute(
        "UPDATE gyne_cytology_cases SET out_lab_result_uploaded_at = updated_at "
        "WHERE out_lab_result_pdf_path IS NOT NULL AND out_lab_result_uploaded_at IS NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('gyne_cytology_cases', 'out_lab_result_uploaded_at')
