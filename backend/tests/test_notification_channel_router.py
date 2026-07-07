"""Router-level tests for app/routers/notification_channel.py.

RBAC note: every route (including create/update/delete, and reading a
channel's raw `credentials` — webhook URLs / API tokens) only requires
`get_current_active_user`, i.e. ANY authenticated, active user regardless of
role. Documented as-is below; see the RBAC-consistency note reported at the
end of the app/routers/ batch.

send_test_notification/send_real_notification (real network calls) are
mocked at the router's own import location rather than re-mocking httpx —
they're already covered directly in test_notification_service.py."""

from unittest.mock import patch

from app.crud.notification_channel import create_channel
from app.schemas.notification_channel import NotificationChannelCreate
import app.routers.notification_channel as notification_channel_router


def _channel_in(**overrides):
    fields = dict(platform="line", name="Test Channel", credentials={"channel_access_token": "secret-token"})
    fields.update(overrides)
    return fields


class TestAnyAuthenticatedUser:
    def test_clinician_can_read_full_credentials(self, db, clinician_client):
        channel = create_channel(db, NotificationChannelCreate(**_channel_in()))
        r = clinician_client.get(f"/notification-channels/{channel.id}")
        assert r.status_code == 200
        assert r.json()["credentials"] == {"channel_access_token": "secret-token"}

    def test_clinician_can_create_update_delete(self, clinician_client):
        created = clinician_client.post("/notification-channels", json=_channel_in()).json()
        updated = clinician_client.put(f"/notification-channels/{created['id']}", json={"name": "Renamed"})
        assert updated.status_code == 200
        deleted = clinician_client.delete(f"/notification-channels/{created['id']}")
        assert deleted.status_code == 204


class TestCrudWiring:
    def test_get_missing_returns_404(self, admin_client):
        assert admin_client.get("/notification-channels/999999").status_code == 404

    def test_requires_authentication(self, client):
        assert client.get("/notification-channels").status_code == 401


class TestTestChannel:
    def test_success(self, db, admin_client):
        channel = create_channel(db, NotificationChannelCreate(**_channel_in()))
        with patch.object(
            notification_channel_router, "send_test_notification",
            return_value={"status": "sent", "platform": "line", "response_code": 200},
        ) as mock_send:
            r = admin_client.post(f"/notification-channels/{channel.id}/test")
        assert r.status_code == 200
        assert r.json()["success"] is True
        mock_send.assert_called_once()

    def test_missing_channel_returns_404(self, admin_client):
        assert admin_client.post("/notification-channels/999999/test").status_code == 404

    def test_value_error_from_sender_becomes_400(self, db, admin_client):
        channel = create_channel(db, NotificationChannelCreate(**_channel_in()))
        with patch.object(notification_channel_router, "send_test_notification", side_effect=ValueError("bad creds")):
            r = admin_client.post(f"/notification-channels/{channel.id}/test")
        assert r.status_code == 400

    def test_other_exception_becomes_502(self, db, admin_client):
        channel = create_channel(db, NotificationChannelCreate(**_channel_in()))
        with patch.object(notification_channel_router, "send_test_notification", side_effect=RuntimeError("network down")):
            r = admin_client.post(f"/notification-channels/{channel.id}/test")
        assert r.status_code == 502


class TestSendChannelNotification:
    def test_success(self, db, admin_client):
        channel = create_channel(db, NotificationChannelCreate(**_channel_in()))
        with patch.object(
            notification_channel_router, "send_real_notification",
            return_value={"status": "sent", "platform": "line", "response_code": 200},
        ):
            r = admin_client.post(f"/notification-channels/{channel.id}/send", json={"data": {"hn": "HN-1"}})
        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_inactive_channel_returns_400(self, db, admin_client):
        channel = create_channel(db, NotificationChannelCreate(**_channel_in(is_active=False)))
        r = admin_client.post(f"/notification-channels/{channel.id}/send", json={"data": {}})
        assert r.status_code == 400
