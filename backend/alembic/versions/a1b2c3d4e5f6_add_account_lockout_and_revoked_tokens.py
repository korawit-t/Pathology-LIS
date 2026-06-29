"""add account lockout fields and revoked_tokens table

Revision ID: lockout000001
Revises: a1b2c3d4e5f6
Create Date: 2026-06-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'lockout000001'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # M3: account lockout columns on users
    op.add_column(
        'users',
        sa.Column('failed_login_attempts', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'users',
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    )

    # H1: JWT revocation — stores JTI of invalidated access tokens until they expire
    op.create_table(
        'revoked_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('jti', sa.String(36), nullable=False, unique=True, index=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table('revoked_tokens')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_attempts')
