"""Tests for the cyto-path concordance QC ledger.

The feature exists because nothing in the system used to survive the hand-off:
non-gyne's cytotechnologist and pathologist write into the same
`nongyne_diagnoses` row, so the pathologist's first save erased what the
screener had actually called. The ledger freezes each side at the moment it is
still true — screening at hand-off, final at sign-out — so the comparison can
be made afterwards. Most of what follows is about that survival property.

See app/crud/cyto_path_correlation.py.
"""

import uuid
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from app.crud.cyto_path_correlation import get_row, get_summary
from app.crud.gyne_cyto_report import complete_gyne_review, publish_gyne_report
from app.crud.gyne_diagnosis import create_initial_diagnosis
from app.crud.nongyne_cyto_case import send_nongyne_to_pathologist
from app.crud.nongyne_cyto_report import publish_nongyne_report
from app.crud.nongyne_diagnosis import (
    create_nongyne_diagnosis,
    get_current_diagnosis,
    update_nongyne_diagnosis,
)
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate, NongyneDiagnosisUpdate
from tests.conftest import _login, _make_user
from tests.factories import (
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_system_setting,
)

_RND = "app.crud.gyne_cyto_report.random.random"


def _cytotech(db):
    user, _ = _make_user(
        db, f"cyto_{uuid.uuid4().hex[:8]}", "CytoPass1!", ["cytotechnologist"]
    )
    return user


def _as_cytotech(db, client):
    """A fresh cytotechnologist, with `client` signed in as them."""
    user, pwd = _make_user(
        db, f"cyto_{uuid.uuid4().hex[:8]}", "CytoPass1!", ["cytotechnologist"]
    )
    return user, _login(client, user.username, pwd)


def _screened_nongyne_case(db, registrar_id, cytotech, pathologist_id, text="Benign cells."):
    """A non-gyne case the cytotech has read and handed to a pathologist."""
    case = make_bare_nongyne_case(db, registrar_id=registrar_id)
    create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=case.id, diagnosis=text))
    send_nongyne_to_pathologist(
        db,
        case_id=case.id,
        pathologist_id=pathologist_id,
        current_user_id=cytotech.id,
    )
    return case


def _rewrite_diagnosis(db, case_id, text):
    diag = get_current_diagnosis(db, case_id)
    update_nongyne_diagnosis(db, diag, NongyneDiagnosisUpdate(diagnosis=text))


class TestNonGyneHandOff:
    def test_hand_off_freezes_the_screening_side(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)

        case = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)

        row = get_row(db, "nongyne", case.id)
        assert row is not None
        assert row.status == "awaiting_signout"
        assert row.screening_summary == "Benign cells."
        assert row.cytotechnologist_id == cyto.id
        assert row.signed_out_at is None

    def test_hand_off_stamps_screened_at(self, db, admin_user, pathologist_user):
        """`screened_at` was never written by any backend code before this
        endpoint existed, which silently dated cytotech workload
        (crud/cyto_workload.py's coalesce) to the report day instead."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)

        case = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)

        db.refresh(case)
        assert case.screened_at is not None
        assert case.is_screened is True
        assert case.pathologist_id == pathologist.id


class TestNonGyneSignOut:
    def test_pathologist_rewrite_does_not_destroy_the_screening_text(
        self, db, admin_user, pathologist_user
    ):
        """The whole point of the feature: both sides survive the sign-out."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = _screened_nongyne_case(
            db, registrar.id, cyto, pathologist.id, text="Negative for malignancy."
        )

        _rewrite_diagnosis(db, case.id, "Adenocarcinoma.")
        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)

        row = get_row(db, "nongyne", case.id)
        assert row.screening_summary == "Negative for malignancy."
        assert row.final_summary == "Adenocarcinoma."
        assert row.auto_result == "changed"
        assert row.status == "pending_review"

    def test_untouched_diagnosis_reads_as_identical(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)

        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)

        assert get_row(db, "nongyne", case.id).auto_result == "identical"

    def test_markup_and_spacing_changes_alone_are_not_a_change(
        self, db, admin_user, pathologist_user
    ):
        """auto_result compares meaning-bearing text, not HTML — otherwise the
        editor reformatting a paragraph would read as a rewritten diagnosis."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = _screened_nongyne_case(
            db, registrar.id, cyto, pathologist.id, text="<p>Benign cells.</p>"
        )

        _rewrite_diagnosis(db, case.id, "<div><b>Benign</b>  cells.</div>")
        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)

        assert get_row(db, "nongyne", case.id).auto_result == "identical"

    def test_pathologist_only_case_is_marked_uncountable(
        self, db, admin_user, pathologist_user
    ):
        """No cytotech ever saw it, so it has no place in a concordance rate."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Malignant.")
        )

        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)

        row = get_row(db, "nongyne", case.id)
        assert row.status == "no_screening_data"
        assert row.auto_result is None

    def test_resign_with_new_wording_reopens_a_graded_case(
        self, db, admin_user, pathologist_user, admin_client
    ):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)
        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)
        row = get_row(db, "nongyne", case.id)
        admin_client.put(f"/cyto-path-correlations/{row.id}", json={"result": "concordant"})

        _rewrite_diagnosis(db, case.id, "Suspicious for malignancy.")
        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)

        db.refresh(row)
        assert row.version_no == 2
        assert row.status == "pending_review"
        assert row.screening_summary == "Benign cells."  # still the original call

    def test_ledger_failure_cannot_block_a_sign_out(self, db, admin_user, pathologist_user):
        """QC bookkeeping is not allowed to be the reason a report fails to
        sign out, so the capture runs inside a SAVEPOINT and swallows errors."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)

        with patch(
            "app.crud.cyto_path_correlation.capture_final",
            side_effect=RuntimeError("ledger exploded"),
        ):
            report = publish_nongyne_report(db, case.id, current_user_id=pathologist.id)

        assert report is not None
        db.refresh(case)
        assert case.is_reported is True


class TestGyneVerdictComesForFree:
    """Gyne already asks the pathologist the concordance question during its
    10% QC review, so the ledger reads that answer instead of asking again."""

    def _flagged_case(self, db, registrar_id, cyto):
        make_system_setting(db, enable_gyne_qc_system=True, nilm_review_every_n=10)
        case = make_bare_gyne_case(db, registrar_id=registrar_id)
        case.cytotechnologist_id = cyto.id
        db.commit()
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        with patch(_RND, return_value=0.0):  # always sampled
            publish_gyne_report(
                db,
                case.id,
                signers=[{"user_id": cyto.id, "role": "cytotechnologist"}],
                current_user_id=cyto.id,
                is_abnormal=False,
            )
        return case

    def test_agree_grades_the_case_without_a_second_click(
        self, db, admin_user, pathologist_user
    ):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = self._flagged_case(db, registrar.id, cyto)

        complete_gyne_review(db, case.id, pathologist.id, review_result="agree")

        row = get_row(db, "gyne", case.id)
        assert row.result == "concordant"
        assert row.status == "reviewed"
        assert row.reviewed_by_id == pathologist.id

    def test_disagree_carries_the_severity_through(self, db, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = self._flagged_case(db, registrar.id, cyto)

        complete_gyne_review(
            db, case.id, pathologist.id,
            review_result="disagree", discrepancy_level="major", review_note="Missed HSIL",
        )

        row = get_row(db, "gyne", case.id)
        assert row.result == "major_discrepancy"
        assert row.status == "reviewed"

    def test_disagree_leaves_the_final_side_for_the_corrected_report(
        self, db, admin_user, pathologist_user
    ):
        """On disagree the standing text is still the cytotech's rejected call.
        Freezing it as "final" would make every disagreement look word-for-word
        identical; the corrected diagnosis only exists after the redo."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = self._flagged_case(db, registrar.id, cyto)

        complete_gyne_review(
            db, case.id, pathologist.id, review_result="disagree", discrepancy_level="minor"
        )

        row = get_row(db, "gyne", case.id)
        assert row.final_diagnosis is None
        assert row.signed_out_at is None

    def test_gyne_case_that_never_enters_qc_stays_out_of_the_ledger(
        self, db, admin_user, pathologist_user
    ):
        """Most gyne cases publish straight through. Opening a row for each
        would bury the ones that carry an actual comparison."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        make_system_setting(db, enable_gyne_qc_system=False)

        publish_gyne_report(db, case.id, current_user_id=pathologist.id, is_abnormal=False)

        assert get_row(db, "gyne", case.id) is None


class TestSummary:
    def _graded_case(self, db, registrar_id, cyto, pathologist, result, client):
        case = _screened_nongyne_case(db, registrar_id, cyto, pathologist.id)
        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)
        row = get_row(db, "nongyne", case.id)
        client.put(f"/cyto-path-correlations/{row.id}", json={"result": result})
        return case

    def test_rates_are_over_graded_rows_only(
        self, db, admin_user, pathologist_user, admin_client
    ):
        """A case nobody has graded yet is not a concordant one — counting it
        as such would flatter every screener until the backlog is cleared."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)

        self._graded_case(db, registrar.id, cyto, pathologist, "concordant", admin_client)
        self._graded_case(db, registrar.id, cyto, pathologist, "major_discrepancy", admin_client)
        # a third case left ungraded
        ungraded = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)
        publish_nongyne_report(db, ungraded.id, current_user_id=pathologist.id)

        summary = get_summary(db, cytotechnologist_id=cyto.id, case_type="nongyne")
        overall = summary["overall"]

        assert overall["total"] == 3
        assert overall["graded"] == 2
        assert overall["pending"] == 1
        assert overall["concordance_rate"] == 50.0
        assert overall["major_rate"] == 50.0

    def test_uncountable_rows_never_reach_the_denominator(
        self, db, admin_user, pathologist_user, admin_client
    ):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        self._graded_case(db, registrar.id, cyto, pathologist, "concordant", admin_client)

        # a pathologist-only case: no screening side at all
        solo = make_bare_nongyne_case(db, registrar_id=registrar.id)
        create_nongyne_diagnosis(db, NongyneDiagnosisCreate(case_id=solo.id, diagnosis="X"))
        publish_nongyne_report(db, solo.id, current_user_id=pathologist.id)

        summary = get_summary(db, cytotechnologist_id=cyto.id, case_type="nongyne")

        assert summary["overall"]["total"] == 1
        assert summary["overall"]["concordance_rate"] == 100.0

    def test_per_cytotechnologist_breakdown_separates_screeners(
        self, db, admin_user, pathologist_user, admin_client
    ):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        alice, bob = _cytotech(db), _cytotech(db)
        self._graded_case(db, registrar.id, alice, pathologist, "concordant", admin_client)
        self._graded_case(db, registrar.id, bob, pathologist, "major_discrepancy", admin_client)

        rows = get_summary(db, case_type="nongyne")["by_cytotechnologist"]
        by_id = {r["user_id"]: r for r in rows}

        assert by_id[alice.id]["concordance_rate"] == 100.0
        assert by_id[bob.id]["concordance_rate"] == 0.0


class TestRouterAccess:
    def test_cytotech_cannot_grade_a_case(self, db, client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)
        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)
        row = get_row(db, "nongyne", case.id)
        _, cyto_client = _as_cytotech(db, client)

        r = cyto_client.put(
            f"/cyto-path-correlations/{row.id}", json={"result": "concordant"}
        )

        assert r.status_code == 403

    def test_cytotech_only_sees_their_own_rows(
        self, db, client, admin_user, pathologist_user
    ):
        """A screener seeing their own numbers is the point; seeing a
        colleague's is not — asking for someone else's id gets their own."""
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        mine, cyto_client = _as_cytotech(db, client)
        theirs = _cytotech(db)
        for owner in (mine, theirs):
            case = _screened_nongyne_case(db, registrar.id, owner, pathologist.id)
            publish_nongyne_report(db, case.id, current_user_id=pathologist.id)

        items = cyto_client.get(
            "/cyto-path-correlations", params={"cytotechnologist_id": theirs.id}
        ).json()["items"]

        assert items, "the screener should still see their own cases"
        assert {i["cytotechnologist"]["id"] for i in items} == {mine.id}

    def test_by_case_returns_both_sides(self, db, admin_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)
        _rewrite_diagnosis(db, case.id, "Malignant cells present.")
        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)

        body = admin_client.get(
            "/cyto-path-correlations/by-case",
            params={"case_type": "nongyne", "case_id": case.id},
        ).json()

        assert body["screening_summary"] == "Benign cells."
        assert body["final_summary"] == "Malignant cells present."
        assert body["case_id"] == case.id

    @pytest.mark.parametrize("bad", ["definitely_not_a_verdict", "agree"])
    def test_verdict_vocabulary_is_closed(
        self, db, admin_client, admin_user, pathologist_user, bad
    ):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)
        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)
        row = get_row(db, "nongyne", case.id)

        r = admin_client.put(f"/cyto-path-correlations/{row.id}", json={"result": bad})

        assert r.status_code == 422

    def test_date_range_filters_on_sign_out_day(
        self, db, admin_client, admin_user, pathologist_user
    ):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        cyto = _cytotech(db)
        case = _screened_nongyne_case(db, registrar.id, cyto, pathologist.id)
        publish_nongyne_report(db, case.id, current_user_id=pathologist.id)
        today = date.today()

        inside = admin_client.get(
            "/cyto-path-correlations",
            params={
                "cytotechnologist_id": cyto.id,
                "start_date": today.isoformat(),
                "end_date": today.isoformat(),
            },
        ).json()
        outside = admin_client.get(
            "/cyto-path-correlations",
            params={
                "cytotechnologist_id": cyto.id,
                "start_date": (today - timedelta(days=30)).isoformat(),
                "end_date": (today - timedelta(days=20)).isoformat(),
            },
        ).json()

        assert inside["total"] == 1
        assert outside["total"] == 0
