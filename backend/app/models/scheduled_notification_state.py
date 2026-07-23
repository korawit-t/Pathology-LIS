# app/models/scheduled_notification_state.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from app.db.database import Base


class ScheduledNotificationState(Base):
    """Dedup ledger so the poll worker notifies once per breach, not every
    cycle. target_key is a composite string (e.g. "{hn}:{appointment_date}")
    rather than a numeric row id, since the natural target for v1's rule type
    is "this patient, this appointment day" — it naturally re-arms the next
    day since target_key embeds the date, with no extra resolved/repeat logic
    needed for the "notify once per breach" cadence.
    """

    __tablename__ = "scheduled_notification_states"

    __table_args__ = (
        UniqueConstraint("rule_id", "target_key", name="uq_sched_notif_state_target"),
    )

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(
        Integer,
        ForeignKey("scheduled_notification_rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_key = Column(String(150), nullable=False)

    first_detected_at = Column(DateTime, nullable=False)
    last_notified_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
