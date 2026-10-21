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


class TestGynePathologistFilters:
    """The pathologist's QC Review tab: pathologist_id (mine) and
    pathologist_unassigned (shared pile) — unlike assigned_user_id, neither
    may match on the cytotechnologist column."""

    def test_pathologist_id_matches_only_the_pathologist_column(
        self, db, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        mine = make_bare_gyne_case(db, registrar_id=registrar.id)
        mine.pathologist_id = path1.id
        # path1 screened this one as the cytotech (a dual-role account) — it
        # belongs in path2's review queue, not path1's.
        screened_by_me = make_bare_gyne_case(db, registrar_id=registrar.id)
        screened_by_me.pathologist_id = path2.id
        screened_by_me.cytotechnologist_id = path1.id
        for c in (mine, screened_by_me):
            c.status = "pending_review"
        db.commit()

        result_ids = [
            c.id
            for c in get_gyne_cases(
                db, status="pending_review", pathologist_id=path1.id, limit=500
            )["items"]
        ]
        assert mine.id in result_ids
        assert screened_by_me.id not in result_ids

    def test_pathologist_unassigned_matches_only_cases_with_no_pathologist(
        self, db, admin_user, two_pathologists
    ):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        unassigned = make_bare_gyne_case(db, registrar_id=registrar.id)
        assigned = make_bare_gyne_case(db, registrar_id=registrar.id)
        assigned.pathologist_id = path1.id
        for c in (unassigned, assigned):
            c.status = "pending_review"
        db.commit()

        result_ids = [
            c.id
            for c in get_gyne_cases(
                db, status="pending_review", pathologist_unassigned=True, limit=500
            )["items"]
        ]
        assert unassigned.id in result_ids
        assert assigned.id not in result_ids

    def test_router_passes_both_params_through(self, pathologist_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        case.status = "pending_review"
        db.commit()

        def ids(**params):
            res = pathologist_client.get(
                "/gyne-cytology",
                params={"status": "pending_review", "search": case.accession_no, **params},
            )
            assert res.status_code == 200
            return [c["id"] for c in res.json()["items"]]

        assert ids(pathologist_unassigned=True) == [case.id]

        path, _ = _make_user(db, f"gfpath3_{uuid.uuid4().hex[:6]}", "PathPass1!", ["pathologist"])
        case.pathologist_id = path.id
        db.commit()

        assert ids(pathologist_unassigned=True) == []
        assert ids(pathologist_id=path.id) == [case.id]
