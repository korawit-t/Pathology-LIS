"""
Tests for get_nongyne_cases' exclude_signed_by / signer_id filters — added
alongside Surgical/Gyne to close a worklist-filtering gap (see
app/crud/gyne_cyto_case.py::get_gyne_cases for the source pattern).

NongyneDiagnosis.signers is a JSON column only populated when a diagnosis
update explicitly sends a `signers` list (there's no dedicated co-sign
workflow wired up for Non-Gyne on the frontend yet), so these tests write it
directly through update_nongyne_diagnosis rather than assuming it's already
populated by some other flow.
"""

import uuid
import pytest

from app.crud.nongyne_diagnosis import create_nongyne_diagnosis, update_nongyne_diagnosis
from app.crud.nongyne_cyto_case import get_nongyne_cases
from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate, NongyneDiagnosisUpdate

from tests.factories import make_bare_nongyne_case
from tests.conftest import _make_user


@pytest.fixture
def two_pathologists(db):
    path1, _ = _make_user(db, f"nfpath1_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    path2, _ = _make_user(db, f"nfpath2_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    return path1, path2


def _sign(db, diagnosis, user_id, signed_at="2026-07-01T10:00:00", role="primary"):
    return update_nongyne_diagnosis(
        db,
        db_obj=diagnosis,
        obj_in=NongyneDiagnosisUpdate(
            signers=[{"user_id": user_id, "role": role, "signed_at": signed_at}]
        ),
    )


class TestNongyneExcludeSignedBy:
    def test_excludes_case_signed_by_the_given_user(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        diagnosis = create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )
        _sign(db, diagnosis, path1.id)

        excluded = get_nongyne_cases(db, exclude_signed_by=path1.id)
        assert case.id not in [c.id for c in excluded["items"]]

    def test_does_not_exclude_for_a_different_user(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        diagnosis = create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )
        _sign(db, diagnosis, path1.id)

        not_excluded = get_nongyne_cases(db, exclude_signed_by=path2.id)
        assert case.id in [c.id for c in not_excluded["items"]]

    def test_does_not_exclude_when_signer_listed_but_not_yet_signed(
        self, db, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        diagnosis = create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )
        # Listed as a co-signer but signed_at is still null — must only be
        # excluded once actually signed, not merely assigned.
        _sign(db, diagnosis, path1.id, signed_at=None, role="co_signer")

        results = get_nongyne_cases(db, exclude_signed_by=path1.id)
        assert case.id in [c.id for c in results["items"]]

    def test_no_filter_returns_the_case_regardless(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        diagnosis = create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )
        _sign(db, diagnosis, path1.id)

        # Scope via search — default pagination can't be relied on to
        # include a specific case once the session has many nongyne cases.
        unfiltered = get_nongyne_cases(db, search=case.accession_no)
        assert case.id in [c.id for c in unfiltered["items"]]


class TestNongyneSignerId:
    def test_filters_to_cases_where_user_is_a_signer(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        other_case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        diagnosis = create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=case.id, diagnosis="Test diagnosis")
        )
        _sign(db, diagnosis, path1.id)
        create_nongyne_diagnosis(
            db, NongyneDiagnosisCreate(case_id=other_case.id, diagnosis="Other diagnosis")
        )

        result_ids = [c.id for c in get_nongyne_cases(db, signer_id=path1.id)["items"]]
        assert case.id in result_ids
        assert other_case.id not in result_ids
