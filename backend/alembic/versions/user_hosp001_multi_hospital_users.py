"""create user_hospitals join table, migrate off users.hospital_id

Revision ID: user_hosp001
Revises: ee1cfb766522
Create Date: 2026-07-06

Manual production SQL (run instead of `alembic upgrade head` if applying by
hand — remember to `alembic stamp head` afterward):

    CREATE TABLE user_hospitals (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        hospital_id INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, hospital_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_hospitals_hospital ON user_hospitals (hospital_id);
    INSERT INTO user_hospitals (user_id, hospital_id)
        SELECT id, hospital_id FROM users WHERE hospital_id IS NOT NULL;
    ALTER TABLE users DROP COLUMN hospital_id;
"""
from alembic import op
import sqlalchemy as sa
from typing import Sequence, Union

revision: str = 'user_hosp001'
down_revision: Union[str, Sequence[str], None] = 'ee1cfb766522'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'user_hospitals',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('hospital_id', sa.Integer(), sa.ForeignKey('hospitals.id', ondelete='CASCADE'), primary_key=True),
    )
    op.create_index('idx_user_hospitals_hospital', 'user_hospitals', ['hospital_id'])

    op.execute(
        "INSERT INTO user_hospitals (user_id, hospital_id) "
        "SELECT id, hospital_id FROM users WHERE hospital_id IS NOT NULL"
    )

    op.drop_column('users', 'hospital_id')


def downgrade() -> None:
    op.add_column('users', sa.Column('hospital_id', sa.Integer(), sa.ForeignKey('hospitals.id'), nullable=True))

    op.execute(
        "UPDATE users u SET hospital_id = ("
        "SELECT MIN(hospital_id) FROM user_hospitals WHERE user_id = u.id"
        ")"
    )

    op.drop_index('idx_user_hospitals_hospital', table_name='user_hospitals')
    op.drop_table('user_hospitals')
