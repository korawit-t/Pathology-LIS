"""Tests for app/crud/notification_rule.py. The real logic here: get_rules
auto-seeds PREDEFINED_EVENTS idempotently (only fills in what's missing, never
duplicates or overwrites), and upsert_rule keeps the legacy `channel_id`
column in sync with the first entry of `channel_ids` — but only when the
caller actually sends channel_ids, and only applies a PREDEFINED_EVENTS
default template on create, not on update.

channel_id is a real FK to notification_channels, so every channel_ids/
channel_id value used below must be a real, committed NotificationChannel —
and every event_key must be unique per test (this is a real, shared Postgres
DB — commits from one test are visible to the next)."""

import uuid

from app.crud.notification_rule import get_rules, get_rule_by_event, upsert_rule, PREDEFINED_EVENTS
from app.crud.notification_channel import create_channel
from app.schemas.notification_rule import NotificationRuleUpdate
from app.schemas.notification_channel import NotificationChannelCreate
from app.models.notification_rule import NotificationRule


def _event_key() -> str:
    return f"custom_event_{uuid.uuid4().hex[:8]}"


def _channel(db) -> int:
    return create_channel(
        db, NotificationChannelCreate(platform="line", name=f"Ch {uuid.uuid4().hex[:8]}", credentials={}),
    ).id


class TestGetRules:
    def test_seeds_all_predefined_events_on_first_call(self, db):
        result = get_rules(db)

        keys = {r.event_key for r in result}
        assert keys == {ev["event_key"] for ev in PREDEFINED_EVENTS}
        assert all(r.is_active is False for r in result)

    def test_is_idempotent_and_does_not_touch_an_already_customized_rule(self, db):
        get_rules(db)
        rule = get_rule_by_event(db, PREDEFINED_EVENTS[0]["event_key"])
        rule.is_active = True
        rule.message_template = "Customized"
        db.commit()

        get_rules(db)  # second call must not re-seed or reset this row

        refreshed = get_rule_by_event(db, PREDEFINED_EVENTS[0]["event_key"])
        assert refreshed.is_active is True
        assert refreshed.message_template == "Customized"
        assert db.query(NotificationRule).filter(
            NotificationRule.event_key == PREDEFINED_EVENTS[0]["event_key"]
        ).count() == 1


class TestUpsertRuleCreate:
    def test_falls_back_to_the_predefined_template_when_none_given(self, db):
        event_key = PREDEFINED_EVENTS[0]["event_key"]
        # Other tests (e.g. get_rules) may have already seeded/customized
        # this exact predefined key via real commits — clear it first so
        # this test reliably hits upsert_rule's *create* branch.
        db.query(NotificationRule).filter(NotificationRule.event_key == event_key).delete()
        db.commit()

        result = upsert_rule(db, event_key, NotificationRuleUpdate(is_active=True))

        assert result.message_template == PREDEFINED_EVENTS[0]["template"]
        assert result.is_active is True

    def test_custom_event_key_with_no_default_gets_a_null_template_if_not_given(self, db):
        result = upsert_rule(db, _event_key(), NotificationRuleUpdate())

        assert result.message_template is None

    def test_sets_legacy_channel_id_from_first_channel_ids_entry_on_create(self, db):
        ch_a, ch_b = _channel(db), _channel(db)

        result = upsert_rule(db, _event_key(), NotificationRuleUpdate(channel_ids=[ch_a, ch_b]))

        assert result.channel_ids == [ch_a, ch_b]
        assert result.channel_id == ch_a

    def test_no_channel_ids_leaves_channel_id_null_on_create(self, db):
        result = upsert_rule(db, _event_key(), NotificationRuleUpdate(is_active=True))

        assert result.channel_id is None


class TestUpsertRuleUpdate:
    def test_updates_only_provided_fields_and_keeps_existing_template(self, db):
        event_key = _event_key()
        upsert_rule(db, event_key, NotificationRuleUpdate(message_template="Original", is_active=False))

        result = upsert_rule(db, event_key, NotificationRuleUpdate(is_active=True))

        assert result.is_active is True
        assert result.message_template == "Original"

    def test_updating_channel_ids_resyncs_legacy_channel_id(self, db):
        event_key = _event_key()
        ch_1 = _channel(db)
        upsert_rule(db, event_key, NotificationRuleUpdate(channel_ids=[ch_1]))
        ch_9, ch_10 = _channel(db), _channel(db)

        result = upsert_rule(db, event_key, NotificationRuleUpdate(channel_ids=[ch_9, ch_10]))

        assert result.channel_id == ch_9

    def test_clearing_channel_ids_to_empty_list_nulls_legacy_channel_id(self, db):
        event_key = _event_key()
        upsert_rule(db, event_key, NotificationRuleUpdate(channel_ids=[_channel(db)]))

        result = upsert_rule(db, event_key, NotificationRuleUpdate(channel_ids=[]))

        assert result.channel_id is None

    def test_updating_an_unrelated_field_does_not_touch_channel_id(self, db):
        event_key = _event_key()
        ch = _channel(db)
        upsert_rule(db, event_key, NotificationRuleUpdate(channel_ids=[ch]))

        result = upsert_rule(db, event_key, NotificationRuleUpdate(is_active=True))

        assert result.channel_id == ch
