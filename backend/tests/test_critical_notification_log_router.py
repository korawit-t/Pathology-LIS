"""Router-level tests for app/routers/critical_notification_log.py. The
crud layer (app/crud/critical_notification_log.py) already has thorough
coverage in test_critical_notification_log.py — this focuses on router-only
logic: the channel_ids -> broadcast_to_channels wiring (mocked, since it's
a real HTTP/network call tested separately for each channel platform) and
auth/wiring/404s."""

from unittest.mock import AsyncMock, patch

from app.crud.notification_channel import create_channel
from app.schemas.notification_channel import NotificationChannelCreate

from tests.factories import make_signable_case


def _log_payload(case_id: int, **overrides) -> dict:
    fields = dict(
        case_id=case_id,
        case_type="SURGICAL",
        notification_type="critical_value",
        notified_at="2026-01-15T10:00:00",
    )
    fields.update(overrides)
    return fields


class TestRbacAndAuth:
    def test_requires_authentication(self, client):
        assert client.get("/critical-notification-logs").status_code == 401

    def test_any_authenticated_role_can_list(self, clinician_client):
        assert clinician_client.get("/critical-notification-logs").status_code == 200


class TestCreate:
    def test_create_without_channels_skips_broadcast(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)

        with patch(
            "app.routers.critical_notification_log.broadcast_to_channels", new_callable=AsyncMock
        ) as mock_broadcast:
            r = pathologist_client.post("/critical-notification-logs", json=_log_payload(case.id))

        assert r.status_code == 201
        assert r.json()["case_id"] == case.id
        mock_broadcast.assert_not_called()

    def test_create_with_active_channel_broadcasts(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        channel = create_channel(
            db, NotificationChannelCreate(platform="line", name="Test Channel", credentials={"token": "x"})
        )

        with patch(
            "app.routers.critical_notification_log.broadcast_to_channels", new_callable=AsyncMock
        ) as mock_broadcast:
            r = pathologist_client.post(
                "/critical-notification-logs", json=_log_payload(case.id, channel_ids=[channel.id])
            )

        assert r.status_code == 201
        assert r.json()["notified_channel_names"] == [f"{channel.name} (LINE)"]
        mock_broadcast.assert_called_once()


class TestListByCase:
    def test_scopes_to_case_id_and_type(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        pathologist_client.post("/critical-notification-logs", json=_log_payload(case.id))

        r = pathologist_client.get(f"/critical-notification-logs/case/{case.id}/SURGICAL")

        assert r.status_code == 200
        assert r.json()["total"] == 1


class TestUpdateRecipient:
    def test_update_missing_returns_404(self, pathologist_client):
        r = pathologist_client.patch("/critical-notification-logs/999999", json={"recipient_name": "Dr. X"})
        assert r.status_code == 404

    def test_update_existing_recipient(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        created = pathologist_client.post("/critical-notification-logs", json=_log_payload(case.id)).json()

        r = pathologist_client.patch(
            f"/critical-notification-logs/{created['id']}", json={"recipient_name": "Dr. Updated"}
        )

        assert r.status_code == 200
        assert r.json()["recipient_name"] == "Dr. Updated"
