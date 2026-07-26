"""Tests for app/scheduled_notifications/worker.py's check-time scheduling
logic (_get_scheduled_times / _seconds_until_next_run). These are plain sync
helpers (no asyncio.run needed, unlike _poll_once/_check_* in the same
module) — the config-read pattern mirrors his_export/worker.py's approach,
tested the same way as test_his_export_worker.py: monkeypatch.setattr on the
*importing* module (worker), and the real-Postgres `db` fixture for state."""

from datetime import datetime

import app.scheduled_notifications.worker as worker
from tests.factories import make_system_setting


class TestGetScheduledTimes:
    def test_returns_configured_times_sorted(self, db):
        make_system_setting(db, scheduled_notification_times=["15:00", "09:00"])
        assert worker._get_scheduled_times() == ["09:00", "15:00"]

    def test_falls_back_to_default_when_none(self, db):
        make_system_setting(db, scheduled_notification_times=None)
        assert worker._get_scheduled_times() == worker._DEFAULT_TIMES

    def test_falls_back_to_default_when_empty(self, db):
        make_system_setting(db, scheduled_notification_times=[])
        assert worker._get_scheduled_times() == worker._DEFAULT_TIMES

    def test_filters_out_malformed_entries_keeping_valid_ones(self, db):
        make_system_setting(db, scheduled_notification_times=["09:00", "9:00", "25:00", 123, None])
        assert worker._get_scheduled_times() == ["09:00"]

    def test_falls_back_to_default_when_all_entries_malformed(self, db):
        make_system_setting(db, scheduled_notification_times=["9:00", "25:00"])
        assert worker._get_scheduled_times() == worker._DEFAULT_TIMES


class TestSecondsUntilNextRun:
    def test_picks_next_future_time_today(self, db, monkeypatch):
        make_system_setting(db, scheduled_notification_times=["09:00", "11:00", "13:00", "15:00"])
        monkeypatch.setattr(worker, "local_now", lambda: datetime(2026, 1, 15, 10, 0, 0))

        assert worker._seconds_until_next_run() == 3600.0  # 10:00 -> 11:00

    def test_wraps_to_tomorrows_earliest_time_when_all_today_passed(self, db, monkeypatch):
        make_system_setting(db, scheduled_notification_times=["09:00", "11:00", "13:00", "15:00"])
        monkeypatch.setattr(worker, "local_now", lambda: datetime(2026, 1, 15, 16, 0, 0))

        assert worker._seconds_until_next_run() == 17 * 3600.0  # 16:00 today -> 09:00 tomorrow

    def test_never_returns_zero_or_negative_at_the_exact_scheduled_moment(self, db, monkeypatch):
        make_system_setting(db, scheduled_notification_times=["09:00"])
        monkeypatch.setattr(worker, "local_now", lambda: datetime(2026, 1, 15, 9, 0, 0))

        # Exactly at 09:00 is not "future today", so it must wrap to
        # tomorrow's 09:00 rather than busy-looping at zero/negative seconds.
        assert worker._seconds_until_next_run() == 24 * 3600.0
