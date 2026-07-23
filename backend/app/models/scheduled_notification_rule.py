# app/models/scheduled_notification_rule.py
from sqlalchemy import Column, Integer, String, Boolean, Text, JSON, DateTime, func
from app.db.database import Base


class ScheduledNotificationRule(Base):
    """A time-based notification rule, checked periodically by the
    scheduled_notifications background worker (as opposed to NotificationRule,
    which fires inline off an HTTP request handling a state change).

    Not a unique key like NotificationRule.event_key: rule_type identifies the
    kind of check (there's exactly one predefined type in v1 —
    "outlab_pending_appointment_today"), while threshold_value/threshold_unit
    hold the admin-configured trigger point for that check.
    """

    __tablename__ = "scheduled_notification_rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_type = Column(String, nullable=False, index=True,
                        comment="Check identifier, e.g. outlab_pending_appointment_today")
    label = Column(String, nullable=True)

    threshold_value = Column(Integer, nullable=False, default=2)
    threshold_unit = Column(String, nullable=False, default="hours",
                             comment="'hours' or 'days'")

    channel_ids = Column(JSON, nullable=True,
                          comment="List of NotificationChannel IDs to notify")
    message_template = Column(Text, nullable=True,
                               comment="Template with {placeholders} filled by check data")
    is_active = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
