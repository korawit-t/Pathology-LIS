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
