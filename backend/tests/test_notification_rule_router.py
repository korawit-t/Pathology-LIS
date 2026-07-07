"""Router-level tests for app/routers/notification_rule.py — same
any-authenticated-user RBAC note as notification_channel."""

from unittest.mock import patch

from app.crud.notification_channel import create_channel
from app.crud.notification_rule import upsert_rule
from app.schemas.notification_channel import NotificationChannelCreate
from app.schemas.notification_rule import NotificationRuleUpdate
import app.routers.notification_rule as notification_rule_router


class TestReadAndUpdate:
    def test_clinician_can_read_rules(self, clinician_client):
        r = clinician_client.get("/notification-rules")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_clinician_can_upsert_a_rule(self, clinician_client):
        r = clinician_client.put("/notification-rules/some_custom_event", json={"is_active": True})
        assert r.status_code == 200
        assert r.json()["is_active"] is True

    def test_requires_authentication(self, client):
        assert client.get("/notification-rules").status_code == 401


class TestTriggerEvent:
    def test_no_rule_configured(self, admin_client):
        r = admin_client.post("/notification-rules/trigger/nonexistent_event", json={"data": {}})
        assert r.status_code == 200
        assert r.json() == {"success": False, "detail": "No rule configured for this event"}

    def test_disabled_rule(self, db, admin_client):
        upsert_rule(db, "disabled_event", NotificationRuleUpdate(is_active=False))
        r = admin_client.post("/notification-rules/trigger/disabled_event", json={"data": {}})
        assert r.json() == {"success": False, "detail": "Rule is disabled"}

    def test_no_channel_assigned(self, db, admin_client):
        upsert_rule(db, "unassigned_event", NotificationRuleUpdate(is_active=True))
        r = admin_client.post("/notification-rules/trigger/unassigned_event", json={"data": {}})
        assert r.json() == {"success": False, "detail": "No channel assigned to this rule"}

    def test_no_active_channels_found(self, db, admin_client):
        channel = create_channel(db, NotificationChannelCreate(platform="line", name="Inactive", credentials={}, is_active=False))
        upsert_rule(db, "inactive_channel_event", NotificationRuleUpdate(is_active=True, channel_ids=[channel.id]))
        r = admin_client.post("/notification-rules/trigger/inactive_channel_event", json={"data": {}})
        assert r.json() == {"success": False, "detail": "No active channels found"}

    def test_sends_to_active_channels(self, db, admin_client):
        channel = create_channel(db, NotificationChannelCreate(platform="line", name="Active", credentials={"a": 1}, is_active=True))
        upsert_rule(db, "active_channel_event", NotificationRuleUpdate(is_active=True, channel_ids=[channel.id]))
        with patch.object(
            notification_rule_router, "send_real_notification",
            return_value={"status": "sent"},
        ) as mock_send:
            r = admin_client.post("/notification-rules/trigger/active_channel_event", json={"data": {"hn": "HN-1"}})
        assert r.status_code == 200
        assert r.json()["success"] is True
        mock_send.assert_called_once()

    def test_per_channel_send_failure_is_captured_not_raised(self, db, admin_client):
        channel = create_channel(db, NotificationChannelCreate(platform="line", name="Flaky", credentials={}, is_active=True))
        upsert_rule(db, "flaky_channel_event", NotificationRuleUpdate(is_active=True, channel_ids=[channel.id]))
        with patch.object(notification_rule_router, "send_real_notification", side_effect=RuntimeError("boom")):
            r = admin_client.post("/notification-rules/trigger/flaky_channel_event", json={"data": {}})
        assert r.status_code == 200  # doesn't propagate as an HTTP error
        assert r.json()["success"] is True
        assert "error" in r.json()["results"][0]
