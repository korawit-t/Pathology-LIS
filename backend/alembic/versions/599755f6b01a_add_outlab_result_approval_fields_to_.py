"""add outlab result approval fields to gyne cytology case

Revision ID: 599755f6b01a
Revises: cccb492b1248
Create Date: 2026-07-22 13:31:40.380722

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '599755f6b01a'
down_revision: Union[str, Sequence[str], None] = 'cccb492b1248'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('gyne_cytology_cases', sa.Column('outlab_result_approved_by_id', sa.Integer(), nullable=True))
    op.add_column('gyne_cytology_cases', sa.Column('outlab_result_approved_at', sa.DateTime(), nullable=True))
    op.create_foreign_key(
        'fk_gyne_cytology_cases_outlab_result_approved_by_id_users',
        'gyne_cytology_cases', 'users', ['outlab_result_approved_by_id'], ['id'],
    )

    # Grandfather in every already-uploaded outlab result as approved — this
    # feature didn't require sign-off before today, so clinicians who could
    # already see these results shouldn't suddenly lose access. Only uploads
    # from this point on require a fresh pathologist sign-off.
    op.execute(
        "UPDATE gyne_cytology_cases SET outlab_result_approved_at = NOW() "
        "WHERE out_lab_result_pdf_path IS NOT NULL AND outlab_result_approved_at IS NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'fk_gyne_cytology_cases_outlab_result_approved_by_id_users',
        'gyne_cytology_cases', type_='foreignkey',
    )
    op.drop_column('gyne_cytology_cases', 'outlab_result_approved_at')
    op.drop_column('gyne_cytology_cases', 'outlab_result_approved_by_id')
