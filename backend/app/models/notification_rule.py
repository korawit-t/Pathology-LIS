# app/models/notification_rule.py
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.db.database import Base


class NotificationRule(Base):
    __tablename__ = "notification_rules"

    id = Column(Integer, primary_key=True, index=True)
    event_key = Column(String, unique=True, nullable=False, index=True,
                       comment="Unique event identifier, e.g. stain_order_ihc, malignancy_result")
    channel_id = Column(Integer, ForeignKey("notification_channels.id"), nullable=True,
                        comment="Legacy single channel; prefer channel_ids")
    channel_ids = Column(JSON, nullable=True,
                         comment="List of channel IDs to notify; overrides channel_id when set")
    message_template = Column(Text, nullable=True,
                             comment="Template with {placeholders} filled by event data")
    is_active = Column(Boolean, default=True, nullable=False)

    channel = relationship("NotificationChannel", backref="rules")
