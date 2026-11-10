"""Round headings on the non-gyne report: the same "DIAGNOSIS REPORT (Dated: …)"
and "ADDENDUM REPORT (Dated: …)" lines surgical prints.

Non-gyne used to print "REPORT #2 — Addendum (05/11/2026)" instead, which had
four problems: no time, no revision reason, newest round first whatever the
cumulative setting said, and no heading at all on a single-round report."""

from datetime import datetime

from app.crud.nongyne_cyto_report import prepare_nongyne_report_data
from app.models.nongyne_diagnosis import NongyneDiagnosis
from app.services.pdf_service import env
from app.utils.report_round_heading import ROUND_HEADING_CLASS, round_heading_html, round_label

from tests.factories import make_bare_nongyne_case, make_system_setting

ORIGINAL_AT = datetime(2026, 10, 29, 17, 40)
ADDENDUM_AT = datetime(2026, 11, 5, 11, 42)


def _add_round(db, case, order, entry_type, at, text, reason=None):
    db.add(NongyneDiagnosis(
        case_id=case.id, diagnosis_order=order, entry_type=entry_type,
        diagnosis_at=at, diagnosis=text, revision_reason=reason, status="signed",
    ))
    db.commit()


def _two_round_case(db, admin_user):
    registrar, _ = admin_user
    case = make_bare_nongyne_case(db, registrar_id=registrar.id)
    _add_round(db, case, 1, "Original", ORIGINAL_AT, "<p>Reactive mesothelial cells</p>")
    _add_round(db, case, 2, "Addendum", ADDENDUM_AT, "<p>Cell block: no malignancy</p>")
    return case


class TestRoundHeadingHtml:
    def test_first_round_is_a_diagnosis_report_dated_to_the_minute(self):
        html = round_heading_html(["Original"], ORIGINAL_AT)

        assert "DIAGNOSIS REPORT" in html
        assert "(Dated: 29/10/2026 17:40)" in html
        assert ROUND_HEADING_CLASS in html

    def test_label_takes_the_first_of_revised_corrected_addendum(self):
        assert round_label(["Addendum", "Revised"]) == "REVISED"
        assert round_label(["Addendum", "Corrected"]) == "CORRECTED"
        assert round_label(["Addendum"]) == "ADDENDUM"
        assert round_label(["Original", None]) == "DIAGNOSIS"

    def test_reason_is_shown_for_revised_and_corrected_only(self):
        assert "(Revised Reason: wrong site)" in round_heading_html(
            ["Revised"], ADDENDUM_AT, "Revised", "wrong site"
        )
        assert "Reason" not in round_heading_html(
            ["Addendum"], ADDENDUM_AT, "Addendum", "cell block result"
        )

    def test_reason_is_escaped(self):
        # Typed into a plain-text field, then rendered through `| safe`.
        html = round_heading_html(["Corrected"], ADDENDUM_AT, "Corrected", "<5% cells & more")

        assert "&lt;5% cells &amp; more" in html
        assert "<5%" not in html


class TestPrepareNongyneReportData:
    def test_single_round_gets_a_heading(self, db, admin_user):
        make_system_setting(db, is_cumulative_report=True)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        _add_round(db, case, 1, "Original", ORIGINAL_AT, "<p>Reactive mesothelial cells</p>")

        html = prepare_nongyne_report_data(db, case.id)["diagnosis"]

        assert html.startswith(f"<div class='{ROUND_HEADING_CLASS}'")
        assert "DIAGNOSIS REPORT" in html
        assert "(Dated: 29/10/2026 17:40)" in html

    def test_cumulative_newest_first(self, db, admin_user):
        make_system_setting(db, is_cumulative_report=True, cumulative_report_newest_first=True)
        case = _two_round_case(db, admin_user)

        html = prepare_nongyne_report_data(db, case.id)["diagnosis"]

        assert html.index("ADDENDUM REPORT") < html.index("DIAGNOSIS REPORT")
        assert "(Dated: 05/11/2026 11:42)" in html
        assert "(Dated: 29/10/2026 17:40)" in html
        assert "REPORT #" not in html

    def test_cumulative_oldest_first_follows_the_setting(self, db, admin_user):
        make_system_setting(db, is_cumulative_report=True, cumulative_report_newest_first=False)
        case = _two_round_case(db, admin_user)

        html = prepare_nongyne_report_data(db, case.id)["diagnosis"]

        assert html.index("DIAGNOSIS REPORT") < html.index("ADDENDUM REPORT")

    def test_not_cumulative_shows_only_the_current_round(self, db, admin_user):
        make_system_setting(db, is_cumulative_report=False, cumulative_report_newest_first=False)
        case = _two_round_case(db, admin_user)

        html = prepare_nongyne_report_data(db, case.id)["diagnosis"]

        assert "ADDENDUM REPORT" in html
        assert "Cell block: no malignancy" in html
        assert "DIAGNOSIS REPORT" not in html
        assert "Reactive mesothelial cells" not in html

    def test_revised_round_shows_its_reason(self, db, admin_user):
        make_system_setting(db, is_cumulative_report=True)
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        _add_round(db, case, 1, "Original", ORIGINAL_AT, "<p>Atypical cells</p>")
        _add_round(db, case, 2, "Revised", ADDENDUM_AT, "<p>Adenocarcinoma</p>", reason="IHC confirmed")

        html = prepare_nongyne_report_data(db, case.id)["diagnosis"]

        assert "REVISED REPORT" in html
        assert "(Revised Reason: IHC confirmed)" in html


class TestDiagnosisSectionHeaderDate:
    """The DIAGNOSIS section header used to carry the report's date. Each round
    now dates itself, so the header keeps the date only for a report published
    before this change, whose stored diagnosis has no round heading."""

    REPORTED_AT = datetime(2026, 11, 5, 14, 30)

    def _render(self, diagnosis_summary):
        return env.get_template("reports/nongyne_cyto_report_template.html").render(
            diagnosis_summary=diagnosis_summary,
            reported_at=self.REPORTED_AT,
            accession_no="N69-00001",
            signers=[],
        )

    def test_new_report_has_no_second_date_on_the_section_header(self):
        html = self._render(round_heading_html(["Original"], ORIGINAL_AT) + "<div>x</div>")

        assert "Dated: 05/11/2026 14:30" not in html
        assert "(Dated: 29/10/2026 17:40)" in html

    def test_report_published_before_round_headings_keeps_its_date(self):
        html = self._render("<p>Reactive mesothelial cells</p>")

        assert "Dated: 05/11/2026 14:30" in html
