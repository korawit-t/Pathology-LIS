"""Tests for the upcoming-appointment block attached to malignancy alerts.

Covers the rendering helpers in app/services/notification_service.py and the
router wiring in app/routers/critical_notification_log.py. The HOSxP lookup
itself is always mocked — it talks to an external hospital MySQL server.
"""

from unittest.mock import AsyncMock, patch

from app.crud.notification_channel import create_channel
from app.routers.critical_notification_log import _augment_template, _lookup_specimen
from app.schemas.notification_channel import NotificationChannelCreate
from app.services.notification_service import (
    _appt_time,
    _thai_date,
    build_his_patient_context,
    format_admission_line,
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


def _admission(**overrides) -> dict:
    row = dict(
        an="690011773",
        regdate="2026-08-12",
        regtime="14:20:00",
        ward="12",
        ward_name="ตึกศัลยกรรมหญิง",
        spclty="02",
    )
    row.update(overrides)
    return row


class TestFormatAdmissionLine:
    def test_renders_ward_an_and_admit_date(self):
        out = format_admission_line(_admission())
        assert out == "\n\n🏥 กำลัง admit — ตึกศัลยกรรมหญิง (AN 690011773, ตั้งแต่ 12 ส.ค. 69)"

    def test_not_admitted_renders_nothing(self):
        # unlike appointments, there is no "not currently admitted" line —
        # that is the norm and would be noise on every alert
        assert format_admission_line(None) == ""

    def test_falls_back_to_ward_code_when_the_join_misses(self):
        assert "— 12 " in format_admission_line(_admission(ward_name=None)) + " "

    def test_survives_missing_an_and_date(self):
        out = format_admission_line(_admission(an=None, regdate=None))
        assert out == "\n\n🏥 กำลัง admit — ตึกศัลยกรรมหญิง"


class TestBuildHisPatientContext:
    def test_blank_hn_skips_lookup(self):
        assert build_his_patient_context("") == ("", "")
        assert build_his_patient_context("-") == ("", "")

    def test_his_not_configured_returns_empty(self):
        with patch("app.db.his_database.get_his_session_direct", return_value=None):
            assert build_his_patient_context("0376632") == ("", "")

    def test_his_error_degrades_to_empty_not_to_a_false_warning(self):
        with patch(
            "app.db.his_database.get_his_session_direct", side_effect=RuntimeError("HIS down")
        ):
            admission, appointments = build_his_patient_context("0376632")
        assert (admission, appointments) == ("", "")
        assert "ไม่พบนัด" not in appointments

    def test_fetches_both_over_one_session_and_closes_it(self):
        session = type("S", (), {"closed": False, "close": lambda self: setattr(self, "closed", True)})()
        with patch("app.db.his_database.get_his_session_direct", return_value=session) as opened, patch(
            "app.his_adapters.hosxp.get_future_appointments", return_value=[_appt()]
        ), patch(
            "app.his_adapters.hosxp.get_active_admission", return_value=_admission()
        ):
            admission, appointments = build_his_patient_context("0376632")
        assert "ตึกศัลยกรรมหญิง" in admission
        assert "24 ส.ค. 69" in appointments
        assert opened.call_count == 1
        assert session.closed is True


class TestLookupSpecimen:
    def test_single_specimen_renders_bare(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.specimen_name = "Colonic mucosa, rectum, colonoscopy biopsy"
        db.commit()

        assert _lookup_specimen(db, case, "SURGICAL") == "Colonic mucosa, rectum, colonoscopy biopsy"

    def test_reports_specimen_a_and_counts_the_rest(self, db, admin_user):
        from app.models.surgical_specimen import SurgicalSpecimen

        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.specimen_name = "Colon, left side colon, hemicolectomy"
        # the kind of low-information extras real multi-specimen cases carry
        db.add(SurgicalSpecimen(case_id=case.id, specimen_label="B", specimen_name="Proximal margin, excision"))
        db.add(SurgicalSpecimen(case_id=case.id, specimen_label="C", specimen_name="Distal margin, excision"))
        db.commit()

        assert _lookup_specimen(db, case, "SURGICAL") == "Colon, left side colon, hemicolectomy (+2 ชิ้น)"

    def test_picks_label_a_regardless_of_insert_order(self, db, admin_user):
        from app.models.surgical_specimen import SurgicalSpecimen

        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.specimen_label = "B"
        specimen.specimen_name = "Lymph node group 8"
        db.add(SurgicalSpecimen(case_id=case.id, specimen_label="A", specimen_name="Whipple's specimen"))
        db.commit()

        assert _lookup_specimen(db, case, "SURGICAL").startswith("Whipple's specimen")

    def test_nongyne_uses_specimen_type(self, db, admin_user):
        from tests.factories import make_bare_nongyne_case

        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        case.specimen_type = "Pleural fluid"
        db.commit()

        assert _lookup_specimen(db, case, "NONGYNE_CYTO") == "Pleural fluid"

    def test_gyne_is_excluded(self, db, admin_user):
        from tests.factories import make_bare_gyne_case

        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        # specimen_type here is the preparation method, not a site
        assert _lookup_specimen(db, case, "GYNE_CYTO") == ""


class TestAugmentTemplate:
    def test_specimen_line_lands_above_the_appointment_block(self):
        out = _augment_template("HN: {hn}{appointments}", specimen=True)
        assert out == "HN: {hn}\nชิ้นเนื้อ: {specimen}{appointments}"

    def test_appends_all_three_in_reading_order(self):
        out = _augment_template("HN: {hn}", specimen=True, admission=True, appointments=True)
        assert out == "HN: {hn}\nชิ้นเนื้อ: {specimen}{admission}{appointments}"

    def test_admission_slots_in_ahead_of_an_existing_appointment_block(self):
        out = _augment_template("HN: {hn}{appointments}", admission=True)
        assert out == "HN: {hn}{admission}{appointments}"

    def test_leaves_an_explicit_placeholder_where_the_admin_put_it(self):
        tpl = "{appointments}\n{specimen}\nHN: {hn}\n{admission}ท้าย"
        assert _augment_template(tpl, specimen=True, admission=True, appointments=True) == tpl

    def test_adds_nothing_when_there_is_no_value(self):
        assert _augment_template("HN: {hn}") == "HN: {hn}"


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
            "app.routers.critical_notification_log.build_his_patient_context",
            return_value=("", "\n\n📅 นัดที่ยังมาไม่ถึง (1)\n• 24 ส.ค. 69 07:00 — ศัลยกรรม"),
        ):
            r = pathologist_client.post(
                "/critical-notification-logs", json=self._payload(case.id, channel.id, "malignancy")
            )

        assert r.status_code == 201
        kwargs = broadcast.call_args.kwargs
        assert "24 ส.ค. 69" in kwargs["data"]["appointments"]
        # appended even though the stored template has no {appointments}
        assert "{appointments}" in kwargs["template"]

    def test_specimen_reaches_the_message_for_every_alert_type(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        specimen.specimen_name = "Colonic mucosa, rectum, colonoscopy biopsy"
        db.commit()
        channel = self._channel(db)

        with patch(
            "app.routers.critical_notification_log.broadcast_to_channels", new_callable=AsyncMock
        ) as broadcast, patch(
            "app.routers.critical_notification_log.build_his_patient_context", return_value=("", "")
        ):
            pathologist_client.post(
                "/critical-notification-logs", json=self._payload(case.id, channel.id, "critical_value")
            )

        kwargs = broadcast.call_args.kwargs
        assert kwargs["data"]["specimen"] == "Colonic mucosa, rectum, colonoscopy biopsy"
        assert "{specimen}" in kwargs["template"]

    def test_critical_value_alert_does_not_look_up_appointments(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        channel = self._channel(db)

        with patch(
            "app.routers.critical_notification_log.broadcast_to_channels", new_callable=AsyncMock
        ) as broadcast, patch(
            "app.routers.critical_notification_log.build_his_patient_context"
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
            "app.routers.critical_notification_log.build_his_patient_context", return_value=("", "\n\n📅 x")
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
            "app.routers.critical_notification_log.build_his_patient_context", return_value=("", "")
        ):
            r = pathologist_client.post(
                "/critical-notification-logs", json=self._payload(case.id, channel.id, "malignancy")
            )

        assert r.status_code == 201
        kwargs = broadcast.call_args.kwargs
        assert kwargs["data"]["appointments"] == ""
        # nothing appended on top of whatever template was already in place
        assert kwargs["template"].count("{appointments}") <= 1
