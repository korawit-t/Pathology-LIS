# app/crud/notification_rule.py
from sqlalchemy.orm import Session
from typing import Dict, Any
from app.models.notification_rule import NotificationRule
from app.schemas.notification_rule import NotificationRuleUpdate

# Predefined events with default message templates
PREDEFINED_EVENTS = [
    {
        "event_key": "stain_order_ihc",
        "label": "สั่ง IHC (Immunohistochemistry)",
        "template": "🔬 สั่ง IHC\nCase: {id_case}\nHN: {hn} | {name}\nแพทย์: {clinician}\nBlock: {block} | จำนวน: {count} รายการ",
    },
    {
        "event_key": "stain_order_special",
        "label": "สั่ง Special Stain",
        "template": "🧪 สั่ง Special Stain\nCase: {id_case}\nHN: {hn} | {name}\nBlock: {block} | จำนวน: {count} รายการ",
    },
    {
        "event_key": "malignancy_result",
        "label": "ผลออก Malignancy",
        "template": "⚠️ ผล Malignancy\nCase: {id_case}\nHN: {hn} | {name}\nแพทย์: {clinician}\nการวินิจฉัย: {diagnosis}",
    },
    {
        "event_key": "critical_case",
        "label": "เคสวิกฤต (Critical)",
        "template": "🚨 Critical Case\nCase: {id_case}\nHN: {hn} | {name}\nแพทย์: {clinician}",
    },
    {
        "event_key": "case_signed_out",
        "label": "Sign-out เคส",
        "template": "✅ Sign-out สำเร็จ\nCase: {id_case}\nHN: {hn} | {name}\nแพทย์: {clinician}",
    },
    {
        "event_key": "outlab_consult",
        "label": "ส่ง Consult นอกโรงพยาบาล",
        "template": "📤 ส่ง Consult นอกโรงพยาบาล\nCase: {id_case}\nAccession: {accession_no}\nผู้ส่ง: {sender}\nห้องแล็บ: {lab_name}",
    },
]


def get_rules(db: Session):
    """Return all rules, auto-seeding predefined events if missing."""
    existing_keys = {r.event_key for r in db.query(NotificationRule).all()}

    for ev in PREDEFINED_EVENTS:
        if ev["event_key"] not in existing_keys:
            db.add(NotificationRule(
                event_key=ev["event_key"],
                channel_id=None,
                message_template=ev["template"],
                is_active=False,
            ))
    db.commit()

    return db.query(NotificationRule).all()


def get_rule_by_event(db: Session, event_key: str):
    return db.query(NotificationRule).filter(NotificationRule.event_key == event_key).first()


def upsert_rule(db: Session, event_key: str, update: NotificationRuleUpdate):
    """Create or update a rule for a given event_key."""
    rule = db.query(NotificationRule).filter(NotificationRule.event_key == event_key).first()
    data = update.model_dump(exclude_unset=True)

    if rule:
        for k, v in data.items():
            setattr(rule, k, v)
        # Keep channel_id in sync with first entry of channel_ids for backward compat
        if "channel_ids" in data:
            rule.channel_id = data["channel_ids"][0] if data["channel_ids"] else None
    else:
        default_template = next(
            (ev["template"] for ev in PREDEFINED_EVENTS if ev["event_key"] == event_key), None
        )
        channel_ids = data.get("channel_ids")
        rule = NotificationRule(
            event_key=event_key,
            message_template=data.get("message_template", default_template),
            channel_ids=channel_ids,
            channel_id=(channel_ids[0] if channel_ids else data.get("channel_id")),
            is_active=data.get("is_active", False),
        )
        db.add(rule)

    db.commit()
    db.refresh(rule)
    return rule

