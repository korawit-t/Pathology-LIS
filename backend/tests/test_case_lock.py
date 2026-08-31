"""Unit tests for app/utils/case_lock.py — the guard that stops image writes
against a case whose report content is already frozen.

The surgical rule is the subtle one: "signed out" alone does NOT lock, because
an open draft diagnosis is the only server-side trace that an addendum is in
progress (the frontend's isAddendumMode is browser state). Mirrors
useSurgicalReport's isLocked formula — see case_lock's docstrings."""

import pytest
from fastapi import HTTPException

from app.models.surgical_diagnosis import SurgicalDiagnosis
from app.models.surgical_report import SurgicalReport
from app.utils.case_lock import (
    assert_gyne_case_unlocked,
    assert_nongyne_case_unlocked,
    assert_surgical_case_unlocked,
    assert_surgical_specimen_unlocked,
)

from tests.factories import (
    make_bare_gyne_case,
    make_bare_nongyne_case,
    make_hospital,
    make_signable_case,
)


def _set_status(db, case, status):
    case.status = status
    db.commit()
    db.refresh(case)
    return case


def _add_draft_diagnosis(db, case_id):
    d = SurgicalDiagnosis(case_id=case_id, diagnosis_level="CASE", status="draft")
    db.add(d)
    db.commit()
    return d


def _expect_locked(fn, *args):
    with pytest.raises(HTTPException) as exc:
        fn(*args)
    assert exc.value.status_code == 423
    return exc.value


class TestSurgical:
    def test_an_open_case_is_not_locked(self, db, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        assert_surgical_case_unlocked(db, case)  # does not raise

    def test_mid_pipeline_statuses_are_not_locked(self, db, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        for status in ("grossed", "stained", "pending diagnosis", "pending immuno"):
            _set_status(db, case, status)
            assert_surgical_case_unlocked(db, case)

    def test_signed_out_with_no_draft_is_locked(self, db, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        _set_status(db, case, "signed out")

        detail = _expect_locked(assert_surgical_case_unlocked, db, case).detail
        assert "signed out" in detail

    def test_signed_out_with_an_open_draft_is_unlocked(self, db, admin_user):
        # This is the addendum flow: the pathologist reopened the case, so a
        # draft diagnosis exists and images must be editable again.
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        _set_status(db, case, "signed out")
        _add_draft_diagnosis(db, case.id)

        assert_surgical_case_unlocked(db, case)  # does not raise

    def test_a_signed_diagnosis_does_not_count_as_an_open_draft(self, db, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        _set_status(db, case, "signed out")
        db.add(SurgicalDiagnosis(case_id=case.id, diagnosis_level="CASE", status="signed"))
        db.commit()

        _expect_locked(assert_surgical_case_unlocked, db, case)

    def test_a_report_awaiting_approval_locks_even_mid_pipeline(self, db, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        _set_status(db, case, "pending diagnosis")
        hospital = make_hospital(db)
        db.add(SurgicalReport(case_id=case.id, hospital_id=hospital.id, status="pending"))
        db.commit()

        _expect_locked(assert_surgical_case_unlocked, db, case)

    def test_a_draft_report_does_not_lock(self, db, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        hospital = make_hospital(db)
        db.add(SurgicalReport(case_id=case.id, hospital_id=hospital.id, status="draft"))
        db.commit()

        assert_surgical_case_unlocked(db, case)

    def test_cancelled_is_locked_even_with_an_open_draft(self, db, admin_user):
        # There is no legitimate amendment path for a cancelled case, so the
        # draft escape hatch must not apply.
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        _set_status(db, case, "cancelled")
        _add_draft_diagnosis(db, case.id)

        _expect_locked(assert_surgical_case_unlocked, db, case)

    def test_pending_peer_review_is_locked(self, db, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        # No SurgicalReport row — the case status alone must be enough.
        _set_status(db, case, "pending peer review")

        _expect_locked(assert_surgical_case_unlocked, db, case)

    def test_a_missing_case_is_left_to_the_endpoint_to_404(self, db):
        assert_surgical_case_unlocked(db, None)  # does not raise

    def test_specimen_lookup_resolves_to_its_case(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        assert_surgical_specimen_unlocked(db, specimen.id)

        _set_status(db, case, "signed out")
        _expect_locked(assert_surgical_specimen_unlocked, db, specimen.id)

    def test_an_unknown_specimen_id_does_not_raise(self, db):
        assert_surgical_specimen_unlocked(db, 999999)


class TestGyne:
    def test_open_statuses_are_not_locked(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        for status in ("registered", "stained", "screened"):
            _set_status(db, case, status)
            assert_gyne_case_unlocked(case)

    def test_published_pending_review_and_cancelled_are_locked(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        for status in ("published", "pending_review", "cancelled"):
            _set_status(db, case, status)
            _expect_locked(assert_gyne_case_unlocked, case)

    def test_revised_is_deliberately_unlocked(self, db, admin_user):
        # revise_diagnosis moves a published case to "revised"; images must be
        # editable from that point or the whole amendment flow is unusable.
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        _set_status(db, case, "revised")

        assert_gyne_case_unlocked(case)

    def test_a_missing_case_does_not_raise(self):
        assert_gyne_case_unlocked(None)


class TestNongyne:
    def test_open_statuses_are_not_locked(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        for status in ("registered", "stained", "slide sent", "screened"):
            _set_status(db, case, status)
            assert_nongyne_case_unlocked(case)

    def test_published_pending_approval_and_cancelled_are_locked(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        for status in ("published", "pending_approval", "cancelled"):
            _set_status(db, case, status)
            _expect_locked(assert_nongyne_case_unlocked, case)

    def test_a_missing_case_does_not_raise(self):
        assert_nongyne_case_unlocked(None)
