"""move slide/stain quality to case level for gyne and nongyne cytology

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-12

- Rename slide_clarity → slide_quality in gyne_cytology_cases and nongyne_cytology_cases
- Drop slide_quality, stain_quality from gyne_diagnoses and nongyne_diagnoses
"""
import sqlalchemy as sa
from alembic import op

revision = "b3c4d5e6f7a8"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade():
    # Rename slide_clarity → slide_quality at case level
    op.alter_column("gyne_cytology_cases", "slide_clarity", new_column_name="slide_quality")
    op.alter_column("nongyne_cytology_cases", "slide_clarity", new_column_name="slide_quality")

    # Drop quality columns from diagnosis tables (now on case)
    op.drop_column("gyne_diagnoses", "slide_quality")
    op.drop_column("gyne_diagnoses", "stain_quality")
    op.drop_column("nongyne_diagnoses", "slide_quality")
    op.drop_column("nongyne_diagnoses", "stain_quality")


def downgrade():
    op.add_column("nongyne_diagnoses", sa.Column("stain_quality", sa.String(20), nullable=True))
    op.add_column("nongyne_diagnoses", sa.Column("slide_quality", sa.String(20), nullable=True))
    op.add_column("gyne_diagnoses", sa.Column("stain_quality", sa.String(20), nullable=True))
    op.add_column("gyne_diagnoses", sa.Column("slide_quality", sa.String(20), nullable=True))

    op.alter_column("nongyne_cytology_cases", "slide_quality", new_column_name="slide_clarity")
    op.alter_column("gyne_cytology_cases", "slide_quality", new_column_name="slide_clarity")
