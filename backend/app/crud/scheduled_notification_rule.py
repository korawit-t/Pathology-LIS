# app/crud/scheduled_notification_rule.py
from sqlalchemy.orm import Session

from app.models.scheduled_notification_rule import ScheduledNotificationRule
from app.schemas.scheduled_notification_rule import ScheduledNotificationRuleUpdate

# Predefined scheduled-check types with default config. Mirrors
# crud/notification_rule.py's PREDEFINED_EVENTS auto-seed pattern, but each
# row here also carries an admin-editable threshold before it's meaningful.
PREDEFINED_SCHEDULED_RULE_TYPES = [
    {
        "rule_type": "outlab_pending_visit_today",
        "label": "ผู้ป่วยมาโรงพยาบาลวันนี้ + ผลย้อมนอก (Outlab) ยังไม่คีย์ HosXP",
        "threshold_value": 2,
        "threshold_unit": "hours",
        "template": (
            "🔔 แจ้งเตือนผลย้อมนอกค้างคีย์\n"
            "HN: {hn} | {name}\n"
            "รายการค้างคีย์: {pending_count} รายการ"
        ),
    },
]


def get_rules(db: Session):
    """Return all scheduled rules, auto-seeding predefined types if missing."""
    existing_types = {r.rule_type for r in db.query(ScheduledNotificationRule).all()}

    for rt in PREDEFINED_SCHEDULED_RULE_TYPES:
        if rt["rule_type"] not in existing_types:
            db.add(ScheduledNotificationRule(
                rule_type=rt["rule_type"],
                label=rt["label"],
                threshold_value=rt["threshold_value"],
                threshold_unit=rt["threshold_unit"],
                message_template=rt["template"],
                is_active=False,
            ))
    db.commit()

    return db.query(ScheduledNotificationRule).all()


def get_active_rules(db: Session):
    """Rules the background worker should evaluate this cycle."""
    return db.query(ScheduledNotificationRule).filter(
        ScheduledNotificationRule.is_active.is_(True)
    ).all()


def get_rule_by_type(db: Session, rule_type: str):
    return db.query(ScheduledNotificationRule).filter(
        ScheduledNotificationRule.rule_type == rule_type
    ).first()


def upsert_rule(db: Session, rule_type: str, update: ScheduledNotificationRuleUpdate):
    """Create or update a rule for the given rule_type."""
    rule = get_rule_by_type(db, rule_type)
    data = update.model_dump(exclude_unset=True)

    if rule:
        for k, v in data.items():
            setattr(rule, k, v)
    else:
        default = next(
            (rt for rt in PREDEFINED_SCHEDULED_RULE_TYPES if rt["rule_type"] == rule_type), None
        )
        rule = ScheduledNotificationRule(
            rule_type=rule_type,
            label=data.get("label", default["label"] if default else None),
            threshold_value=data.get("threshold_value", default["threshold_value"] if default else 2),
            threshold_unit=data.get("threshold_unit", default["threshold_unit"] if default else "hours"),
            channel_ids=data.get("channel_ids"),
            message_template=data.get("message_template", default["template"] if default else None),
            is_active=data.get("is_active", False),
        )
        db.add(rule)

    db.commit()
    db.refresh(rule)
    return rule
