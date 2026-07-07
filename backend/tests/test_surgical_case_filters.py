"""
Tests for get_cases' exclude_signed filter (app/crud/surgical_case.py) —
Surgical is case-level (a simple status check: "signed out" / "addendum
signed"), unlike Gyne/NonGyne which check a per-signer JSON column. See
test_nongyne_case_filters.py / test_gyne_case_filters.py for the
signer-level equivalent.
"""

import pytest

from app.crud.surgical_case import get_cases

from tests.factories import make_bare_case


class TestSurgicalExcludeSigned:
    def test_excludes_signed_out_case(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.status = "signed out"
        db.commit()

        results = get_cases(db, exclude_signed=True)
        assert case.id not in [c.id for c in results["items"]]

    def test_excludes_addendum_signed_case(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.status = "addendum signed"
        db.commit()

        results = get_cases(db, exclude_signed=True)
        assert case.id not in [c.id for c in results["items"]]

    def test_does_not_exclude_unsigned_case(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        assert case.status == "registered"

        # Scope to this case via search — get_cases' default pagination
        # (limit=20, ordered by accession_no) can't be relied on to include
        # a specific case once the session has accumulated many cases.
        results = get_cases(db, exclude_signed=True, search=case.accession_no)
        assert case.id in [c.id for c in results["items"]]

    def test_no_filter_returns_signed_case(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        case.status = "signed out"
        db.commit()

        results = get_cases(db, search=case.accession_no)
        assert case.id in [c.id for c in results["items"]]


class TestSurgicalPrioritizeStatus:
    def test_prioritized_status_sorted_first(self, db, admin_user):
        registrar, _ = admin_user
        # Scope to just this test's cases via a shared pathologist_id, since
        # get_cases orders across the whole table otherwise.
        pathologist_id = registrar.id

        signed_out = make_bare_case(db, registrar_id=registrar.id)
        signed_out.pathologist_id = pathologist_id
        signed_out.status = "signed out"

        slide_sent = make_bare_case(db, registrar_id=registrar.id)
        slide_sent.pathologist_id = pathologist_id
        slide_sent.status = "slide sent"

        registered = make_bare_case(db, registrar_id=registrar.id)
        registered.pathologist_id = pathologist_id
        assert registered.status == "registered"
        db.commit()

        results = get_cases(
            db, pathologist_id=pathologist_id, prioritize_status="slide sent"
        )
        ids = [c.id for c in results["items"]]
        assert ids[0] == slide_sent.id
        assert set(ids[1:]) == {signed_out.id, registered.id}

    def test_no_prioritize_status_keeps_accession_order(self, db, admin_user):
        registrar, _ = admin_user
        pathologist_id = registrar.id

        slide_sent = make_bare_case(db, registrar_id=registrar.id)
        slide_sent.pathologist_id = pathologist_id
        slide_sent.status = "slide sent"

        registered = make_bare_case(db, registrar_id=registrar.id)
        registered.pathologist_id = pathologist_id
        db.commit()

        results = get_cases(db, pathologist_id=pathologist_id)
        ids = [c.id for c in results["items"]]
        expected = sorted(
            [slide_sent, registered], key=lambda c: c.accession_no
        )
        assert ids == [c.id for c in expected]
