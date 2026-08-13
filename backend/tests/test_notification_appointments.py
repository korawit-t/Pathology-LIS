"""Tests for the upcoming-appointment block attached to malignancy alerts.

Covers the rendering helpers in app/services/notification_service.py and the
router wiring in app/routers/critical_notification_log.py. The HOSxP lookup
itself is always mocked — it talks to an external hospital MySQL server.
"""

from unittest.mock import AsyncMock, patch

from app.crud.notification_channel import create_channel
from app.schemas.notification_channel import NotificationChannelCreate
from app.services.notification_service import (
    _appt_time,
    _thai_date,
    build_appointment_block,
    format_appointment_block,
)

from tests.factories import make_signable_case


def _appt(**overrides) -> dict:
    row = dict(
        nextdate="2026-08-24",
        nexttime="7:00:00",
        note="รับยาเคมี FAC Cycle 1",
        doctor=None,
        clinic="050",
        depcode="050",
        department="ห้องตรวจศัลยกรรมทั่วไป",
    )
    row.update(overrides)
    return row


class TestThaiDate:
    def test_converts_to_buddhist_era_short_year(self):
        assert _thai_date("2026-08-24") == "24 ส.ค. 69"

    def test_january_and_december_boundaries(self):
        assert _thai_date("2027-01-08") == "8 ม.ค. 70"
        assert _thai_date("2026-12-31") == "31 ธ.ค. 69"

    def test_unparseable_input_passes_through(self):
        assert _thai_date("not-a-date") == "not-a-date"
        assert _thai_date(None) == "None"


class TestApptTime:
    def test_pads_single_digit_hour(self):
        # pymysql returns MySQL TIME columns as timedelta, whose str() is "7:00:00"
        assert _appt_time("7:00:00") == "07:00"
        assert _appt_time("07:30:00") == "07:30"

    def test_midnight_means_no_time_set(self):
        assert _appt_time("0:00:00") == ""

    def test_empty_and_malformed(self):
        assert _appt_time("") == ""
        assert _appt_time(None) == ""
        assert _appt_time("garbage") == ""


class TestFormatAppointmentBlock:
    def test_renders_date_department_and_note(self):
        out = format_appointment_block([_appt()])
        assert "📅 นัดที่ยังมาไม่ถึง (1)" in out
        assert "• 24 ส.ค. 69 07:00 — ห้องตรวจศัลยกรรมทั่วไป" in out
        assert "รับยาเคมี FAC Cycle 1" in out

    def test_empty_list_warns_no_appointment(self):
        assert "ไม่พบนัดล่วงหน้าในระบบ" in format_appointment_block([])

    def test_none_means_lookup_failed_and_renders_nothing(self):
        # Critical distinction: an unreachable HIS must not be reported to
        # staff as "this patient has no appointment".
        assert format_appointment_block(None) == ""

    def test_falls_back_to_clinic_code_when_department_null(self):
        out = format_appointment_block([_appt(department=None, clinic="074")])
        assert "คลินิก 074" in out

    def test_flattens_newlines_inside_note(self):
        out = format_appointment_block([_appt(note="รับยาเคมี Folfox-4\n**** เจาะเลือด")])
        assert "รับยาเคมี Folfox-4 **** เจาะเลือด" in out
        # one appointment renders exactly 3 lines (header, bullet, note) —
        # the note's own line break must not add a 4th
        assert len(out.lstrip("\n").split("\n")) == 3

    def test_caps_at_five_and_reports_the_remainder(self):
        out = format_appointment_block([_appt() for _ in range(8)])
        assert "📅 นัดที่ยังมาไม่ถึง (8)" in out
        assert out.count("• ") == 5
        assert "…และอีก 3 รายการ" in out

    def test_omits_time_when_midnight(self):
        out = format_appointment_block([_appt(nexttime="0:00:00")])
        assert "• 24 ส.ค. 69 — ห้องตรวจศัลยกรรมทั่วไป" in out

    def test_block_starts_with_blank_lines_so_it_appends_cleanly(self):
        assert format_appointment_block([_appt()]).startswith("\n\n")


class TestBuildAppointmentBlock:
    def test_blank_hn_skips_lookup(self):
        assert build_appointment_block("") == ""
        assert build_appointment_block("-") == ""

    def test_his_not_configured_returns_empty(self):
        with patch("app.db.his_database.get_his_session_direct", return_value=None):
            assert build_appointment_block("0376632") == ""

    def test_his_error_degrades_to_empty_not_to_a_false_warning(self):
        with patch(
            "app.db.his_database.get_his_session_direct", side_effect=RuntimeError("HIS down")
        ):
            out = build_appointment_block("0376632")
        assert out == ""
        assert "ไม่พบนัด" not in out

    def test_closes_the_his_session(self):
        session = type("S", (), {"closed": False, "close": lambda self: setattr(self, "closed", True)})()
        with patch("app.db.his_database.get_his_session_direct", return_value=session), patch(
            "app.his_adapters.hosxp.get_future_appointments", return_value=[_appt()]
        ):
            out = build_appointment_block("0376632")
        assert "24 ส.ค. 69" in out
        assert session.closed is True


class TestRouterWiring:
    def _payload(self, case_id: int, channel_id: int, notification_type: str) -> dict:
        return dict(
            case_id=case_id,
            case_type="SURGICAL",
            notification_type=notification_type,
            notified_at="2026-01-15T10:00:00",
            channel_ids=[channel_id],
        )

    def _channel(self, db):
        return create_channel(
            db,
            NotificationChannelCreate(platform="line", name="Ch", credentials={"token": "x"}),
        )

    def test_malignancy_alert_carries_the_appointment_block(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        channel = self._channel(db)

        with patch(
            "app.routers.critical_notification_log.broadcast_to_channels", new_callable=AsyncMock
        ) as broadcast, patch(
            "app.routers.critical_notification_log.build_appointment_block",
            return_value="\n\n📅 นัดที่ยังมาไม่ถึง (1)\n• 24 ส.ค. 69 07:00 — ศัลยกรรม",
        ):
            r = pathologist_client.post(
                "/critical-notification-logs", json=self._payload(case.id, channel.id, "malignancy")
            )

        assert r.status_code == 201
        kwargs = broadcast.call_args.kwargs
        assert "24 ส.ค. 69" in kwargs["data"]["appointments"]
        # appended even though the stored template has no {appointments}
        assert "{appointments}" in kwargs["template"]

    def test_critical_value_alert_does_not_look_up_appointments(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        channel = self._channel(db)

        with patch(
            "app.routers.critical_notification_log.broadcast_to_channels", new_callable=AsyncMock
        ) as broadcast, patch(
            "app.routers.critical_notification_log.build_appointment_block"
        ) as build:
            r = pathologist_client.post(
                "/critical-notification-logs", json=self._payload(case.id, channel.id, "critical_value")
            )

        assert r.status_code == 201
        build.assert_not_called()
        assert broadcast.call_args.kwargs["data"]["appointments"] == ""

    def test_existing_placeholder_is_not_duplicated(self, db, pathologist_client, admin_user):
        from app.crud import notification_rule as crud_rule
        from app.schemas.notification_rule import NotificationRuleUpdate

        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        channel = self._channel(db)
        crud_rule.upsert_rule(
            db,
            "malignancy_result",
            NotificationRuleUpdate(
                channel_ids=[channel.id],
                message_template="HN: {hn}{appointments}\nท้ายข้อความ",
            ),
        )

        with patch(
            "app.routers.critical_notification_log.broadcast_to_channels", new_callable=AsyncMock
        ) as broadcast, patch(
            "app.routers.critical_notification_log.build_appointment_block", return_value="\n\n📅 x"
        ):
            pathologist_client.post(
                "/critical-notification-logs", json=self._payload(case.id, channel.id, "malignancy")
            )

        template = broadcast.call_args.kwargs["template"]
        assert template.count("{appointments}") == 1
        assert template.endswith("ท้ายข้อความ")

    def test_failed_lookup_leaves_the_message_unchanged(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        channel = self._channel(db)

        with patch(
            "app.routers.critical_notification_log.broadcast_to_channels", new_callable=AsyncMock
        ) as broadcast, patch(
            "app.routers.critical_notification_log.build_appointment_block", return_value=""
        ):
            r = pathologist_client.post(
                "/critical-notification-logs", json=self._payload(case.id, channel.id, "malignancy")
            )

        assert r.status_code == 201
        kwargs = broadcast.call_args.kwargs
        assert kwargs["data"]["appointments"] == ""
        # nothing appended on top of whatever template was already in place
        assert kwargs["template"].count("{appointments}") <= 1
