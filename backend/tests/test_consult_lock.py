"""Tests for app/utils/consult_lock.py — a single guard function shared by
the Surgical/NonGyne draft-save paths. All three conditions must hold for
the lock to trigger: dispatched for out-lab consult, still "processing",
and no consult PDF has come back yet."""

import pytest
from fastapi import HTTPException

from app.utils.consult_lock import assert_consult_not_locked
from tests.factories import make_bare_case


class FakeCase:
    def __init__(self, is_out_lab_consult=False, consult_status=None, consult_pdf_path=None):
        self.is_out_lab_consult = is_out_lab_consult
        self.consult_status = consult_status
        self.consult_pdf_path = consult_pdf_path


class TestAssertConsultNotLocked:
    def test_raises_423_when_dispatched_and_processing_with_no_pdf_back_yet(self):
        case = FakeCase(is_out_lab_consult=True, consult_status="processing", consult_pdf_path=None)

        with pytest.raises(HTTPException) as exc_info:
            assert_consult_not_locked(case)

        assert exc_info.value.status_code == 423

    def test_allows_when_the_consult_pdf_has_already_come_back(self):
        case = FakeCase(is_out_lab_consult=True, consult_status="processing", consult_pdf_path="/uploads/consults/1.pdf")

        assert_consult_not_locked(case)  # no exception

    def test_allows_when_status_is_not_processing(self):
        case = FakeCase(is_out_lab_consult=True, consult_status="completed", consult_pdf_path=None)

        assert_consult_not_locked(case)  # no exception

    def test_allows_when_not_an_out_lab_consult_case(self):
        case = FakeCase(is_out_lab_consult=False, consult_status="processing", consult_pdf_path=None)

        assert_consult_not_locked(case)  # no exception

    def test_allows_a_none_case(self):
        assert_consult_not_locked(None)  # no exception

    def test_works_against_a_real_surgical_case_instance(self, db, admin_user):
        # The guard is applied to real SurgicalCase ORM objects in the
        # actual save paths, not just plain attribute-holders — confirm it
        # reads the real model's columns correctly too.
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.is_out_lab_consult = True
        case.consult_status = "processing"
        db.commit()

        with pytest.raises(HTTPException) as exc_info:
            assert_consult_not_locked(case)
        assert exc_info.value.status_code == 423
