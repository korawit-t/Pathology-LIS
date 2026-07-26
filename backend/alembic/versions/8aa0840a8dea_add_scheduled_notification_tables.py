"""add scheduled_notification_rules and scheduled_notification_states tables

Adds the time-based counterpart to notification_rules: a scheduled rule has
an admin-configurable threshold (threshold_value/threshold_unit) checked
periodically by the app/scheduled_notifications background worker, rather
than firing inline off an HTTP request. scheduled_notification_states is a
dedup ledger keyed by (rule_id, target_key) so the worker notifies once per
breach instead of every poll cycle.

A DB patched manually via backend/db/add_scheduled_notification_tables.sql
needs `alembic stamp head` afterward so this migration doesn't try to re-run.

Revision ID: 8aa0840a8dea
Revises: 773da4e8976c
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8aa0840a8dea"
down_revision: Union[str, None] = "773da4e8976c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scheduled_notification_rules",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("rule_type", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("threshold_value", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("threshold_unit", sa.String(), nullable=False, server_default="hours"),
        sa.Column("channel_ids", sa.JSON(), nullable=True),
        sa.Column("message_template", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_scheduled_notification_rules_rule_type",
        "scheduled_notification_rules",
        ["rule_type"],
    )

    op.create_table(
        "scheduled_notification_states",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("target_key", sa.String(150), nullable=False),
        sa.Column("first_detected_at", sa.DateTime(), nullable=False),
        sa.Column("last_notified_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["rule_id"], ["scheduled_notification_rules.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_scheduled_notification_states_rule_id",
        "scheduled_notification_states",
        ["rule_id"],
    )
    op.create_index(
        "uq_scheduled_notification_states_target",
        "scheduled_notification_states",
        ["rule_id", "target_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_scheduled_notification_states_target", table_name="scheduled_notification_states")
    op.drop_index("ix_scheduled_notification_states_rule_id", table_name="scheduled_notification_states")
    op.drop_table("scheduled_notification_states")

    op.drop_index("ix_scheduled_notification_rules_rule_type", table_name="scheduled_notification_rules")
    op.drop_table("scheduled_notification_rules")
