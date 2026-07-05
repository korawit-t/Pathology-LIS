"""
Tests for get_gyne_cases' exclude_signed_by / signer_id filters
(app/crud/gyne_cyto_case.py) — the source pattern that NonGyne's
get_nongyne_cases was mirrored from. See test_nongyne_case_filters.py for
the sibling suite.
"""

import uuid
import pytest

from app.crud.gyne_diagnosis import create_initial_diagnosis, update_diagnosis
from app.crud.gyne_cyto_case import get_gyne_cases
from app.schemas.gyne_diagnosis import GyneDiagnosisCreate, GyneDiagnosisUpdate

from tests.factories import make_bare_gyne_case
from tests.conftest import _make_user


@pytest.fixture
def two_pathologists(db):
    path1, _ = _make_user(db, f"gfpath1_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    path2, _ = _make_user(db, f"gfpath2_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
    return path1, path2


def _sign(db, diagnosis_id, user_id, signed_at="2026-07-01T10:00:00", role="primary"):
    return update_diagnosis(
        db,
        diagnosis_id,
        GyneDiagnosisUpdate(signers=[{"user_id": user_id, "role": role, "signed_at": signed_at}]),
    )


class TestGyneExcludeSignedBy:
    def test_excludes_case_signed_by_the_given_user(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        diagnosis = create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        _sign(db, diagnosis.id, path1.id)

        excluded = get_gyne_cases(db, exclude_signed_by=path1.id)
        assert case.id not in [c.id for c in excluded["items"]]

    def test_does_not_exclude_for_a_different_user(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        diagnosis = create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        _sign(db, diagnosis.id, path1.id)

        not_excluded = get_gyne_cases(db, exclude_signed_by=path2.id)
        assert case.id in [c.id for c in not_excluded["items"]]

    def test_does_not_exclude_when_signer_listed_but_not_yet_signed(
        self, db, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        diagnosis = create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        _sign(db, diagnosis.id, path1.id, signed_at=None, role="co_signer")

        results = get_gyne_cases(db, exclude_signed_by=path1.id)
        assert case.id in [c.id for c in results["items"]]

    def test_no_filter_returns_the_case_regardless(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        diagnosis = create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        _sign(db, diagnosis.id, path1.id)

        # Scope via search — default pagination can't be relied on to
        # include a specific case once the session has many gyne cases.
        unfiltered = get_gyne_cases(db, search=case.accession_no)
        assert case.id in [c.id for c in unfiltered["items"]]


class TestGyneSignerId:
    def test_filters_to_cases_where_user_is_a_signer(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        other_case = make_bare_gyne_case(db, registrar_id=registrar.id)
        diagnosis = create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=case.id))
        _sign(db, diagnosis.id, path1.id)
        create_initial_diagnosis(db, GyneDiagnosisCreate(case_id=other_case.id))

        result_ids = [c.id for c in get_gyne_cases(db, signer_id=path1.id)["items"]]
        assert case.id in result_ids
        assert other_case.id not in result_ids
