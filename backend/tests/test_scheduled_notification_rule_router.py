"""Router-level tests for app/routers/scheduled_notification_rule.py.

RBAC: gated by CAN_MANAGE_SETTINGS (admin, lab_manager, pathologist,
senior_pathologist), same tier as the sibling notification_rule/
notification_channel routers it sits next to in the admin Settings UI."""

from app.crud.scheduled_notification_rule import PREDEFINED_SCHEDULED_RULE_TYPES


class TestReadAndUpdate:
    def test_requires_authentication(self, client):
        assert client.get("/scheduled-notification-rules").status_code == 401

    def test_clinician_is_forbidden(self, clinician_client):
        assert clinician_client.get("/scheduled-notification-rules").status_code == 403
        r = clinician_client.put(
            "/scheduled-notification-rules/outlab_pending_visit_today",
            json={"is_active": True},
        )
        assert r.status_code == 403

    def test_lab_manager_can_read_rules_auto_seeded(self, lab_manager_client):
        r = lab_manager_client.get("/scheduled-notification-rules")
        assert r.status_code == 200
        rule_types = {row["rule_type"] for row in r.json()}
        expected = {rt["rule_type"] for rt in PREDEFINED_SCHEDULED_RULE_TYPES}
        assert expected.issubset(rule_types)

        seeded = next(
            row for row in r.json() if row["rule_type"] == "outlab_pending_visit_today"
        )
        assert seeded["is_active"] is False
        assert seeded["threshold_unit"] == "hours"
        assert seeded["threshold_value"] == 2

    def test_lab_manager_can_upsert_threshold_and_activate(self, lab_manager_client):
        r = lab_manager_client.put(
            "/scheduled-notification-rules/outlab_pending_visit_today",
            json={"threshold_value": 4, "is_active": True, "channel_ids": [1]},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["threshold_value"] == 4
        assert body["is_active"] is True
        assert body["channel_ids"] == [1]

        # Persisted, not just echoed back.
        r2 = lab_manager_client.get("/scheduled-notification-rules")
        seeded = next(
            row for row in r2.json() if row["rule_type"] == "outlab_pending_visit_today"
        )
        assert seeded["threshold_value"] == 4
        assert seeded["is_active"] is True
