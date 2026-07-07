"""Tests for app/crud/notification_channel.py — thin CRUD, kept lean."""

from app.crud.notification_channel import (
    get_channel,
    get_channels,
    create_channel,
    update_channel,
    delete_channel,
)
from app.schemas.notification_channel import NotificationChannelCreate, NotificationChannelUpdate


class TestCreateChannel:
    def test_persists_credentials_json(self, db):
        result = create_channel(
            db,
            NotificationChannelCreate(
                platform="line", name="LINE Notify", credentials={"token": "abc123"},
            ),
        )

        assert result.id is not None
        assert result.credentials == {"token": "abc123"}
        assert get_channel(db, result.id).platform == "line"


class TestUpdateChannel:
    def test_updates_only_provided_fields(self, db):
        channel = create_channel(
            db, NotificationChannelCreate(platform="line", name="Original", credentials={"token": "a"}),
        )

        result = update_channel(db, channel.id, NotificationChannelUpdate(name="Renamed"))

        assert result.name == "Renamed"
        assert result.credentials == {"token": "a"}

    def test_missing_id_returns_none(self, db):
        assert update_channel(db, 999999, NotificationChannelUpdate(name="x")) is None


class TestDeleteChannel:
    def test_deletes_existing_and_returns_true(self, db):
        channel = create_channel(
            db, NotificationChannelCreate(platform="line", name="Temp", credentials={}),
        )

        assert delete_channel(db, channel.id) is True
        assert get_channel(db, channel.id) is None

    def test_missing_id_returns_false(self, db):
        assert delete_channel(db, 999999) is False


class TestGetChannels:
    def test_paginates(self, db):
        for i in range(3):
            create_channel(
                db, NotificationChannelCreate(platform="line", name=f"Ch{i}", credentials={}),
            )

        page = get_channels(db, skip=1, limit=1)

        assert len(page) == 1
