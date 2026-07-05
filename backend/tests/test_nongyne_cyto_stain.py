"""Tests for app/crud/nongyne_cyto_stain.py — slide CRUD, the
PAP_ROUTINE-based auto-create-default-stain helper (returns [] gracefully
when no such master test exists, unlike Gyne's version which also falls
back to a SystemSetting-configured default — confirmed intentional, NonGyne
has no such setting), and create_stain_run's slide+case status stamping."""

from app.crud.nongyne_cyto_stain import (
    create_stain,
    get_stains_by_case,
    update_stain,
    get_pending_print_stains,
    get_registered_queue_stains,
    auto_create_default_stain,
    create_stain_run,
    get_all_stain_runs,
)
from app.schemas.nongyne_cyto_stain import NongyneStainCreate, NongyneStainUpdate
from app.models.nongyne_cyto_stain import NongyneCytologyStain

from tests.factories import make_bare_nongyne_case, make_anatomical_pathology_test


def _test_id(db) -> int:
    return make_anatomical_pathology_test(db, category="Cytology").id


class TestCreateAndUpdateStain:
    def test_create_stain(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        stain = create_stain(db, NongyneStainCreate(case_id=case.id, test_id=_test_id(db), slide_no=1))

        assert stain.id is not None
        assert stain.status == "pending"

    def test_update_missing_returns_none(self, db):
        assert update_stain(db, 999999, NongyneStainUpdate(status="stained")) is None

    def test_update_existing_fields(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        stain = create_stain(db, NongyneStainCreate(case_id=case.id, test_id=_test_id(db)))

        updated = update_stain(db, stain.id, NongyneStainUpdate(is_printed=True))

        assert updated.is_printed is True


class TestGetStainsByCase:
    def test_filters_to_case(self, db, admin_user):
        registrar, _ = admin_user
        case1 = make_bare_nongyne_case(db, registrar_id=registrar.id)
        case2 = make_bare_nongyne_case(db, registrar_id=registrar.id)
        stain1 = create_stain(db, NongyneStainCreate(case_id=case1.id, test_id=_test_id(db)))
        create_stain(db, NongyneStainCreate(case_id=case2.id, test_id=_test_id(db)))

        result = get_stains_by_case(db, case1.id)

        assert [s.id for s in result] == [stain1.id]


class TestGetPendingPrintAndRegisteredQueue:
    def test_pending_print_excludes_already_printed(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        test_id = _test_id(db)
        not_printed = create_stain(db, NongyneStainCreate(case_id=case.id, test_id=test_id, slide_no=1))
        printed = create_stain(db, NongyneStainCreate(case_id=case.id, test_id=test_id, slide_no=2))
        update_stain(db, printed.id, NongyneStainUpdate(is_printed=True))

        result_ids = [s.id for s in get_pending_print_stains(db)]

        assert not_printed.id in result_ids
        assert printed.id not in result_ids

    def test_registered_queue_only_pending_status(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        test_id = _test_id(db)
        pending = create_stain(db, NongyneStainCreate(case_id=case.id, test_id=test_id, slide_no=1, status="pending"))
        stained = create_stain(db, NongyneStainCreate(case_id=case.id, test_id=test_id, slide_no=2, status="stained"))

        result_ids = [s.id for s in get_registered_queue_stains(db)]

        assert pending.id in result_ids
        assert stained.id not in result_ids


class TestAutoCreateDefaultStain:
    def test_returns_empty_list_when_no_pap_routine_test_exists(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        result = auto_create_default_stain(db, case.id, count=2)

        assert result == []

    def test_creates_count_slides_using_pap_routine_test(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        pap_test = make_anatomical_pathology_test(db, system_code="PAP_ROUTINE", category="Cytology")

        result = auto_create_default_stain(db, case.id, count=3)

        assert len(result) == 3
        assert all(s.test_id == pap_test.id for s in result)
        assert sorted(s.slide_no for s in result) == [1, 2, 3]


class TestCreateStainRun:
    def test_marks_stains_and_case_stained(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        stain = create_stain(db, NongyneStainCreate(case_id=case.id, test_id=_test_id(db)))

        run = create_stain_run(db, stainer_id="ST-1", stain_ids=[stain.id], run_no="RUN-1", user_id=registrar.id)

        assert run.status == "completed"
        db.refresh(stain)
        assert stain.status == "stained"
        db.refresh(case)
        assert case.status == "stained"

    def test_duplicate_run_no_returns_400(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        stain = create_stain(db, NongyneStainCreate(case_id=case.id, test_id=_test_id(db)))
        create_stain_run(db, stainer_id="ST-1", stain_ids=[stain.id], run_no="RUN-DUP", user_id=registrar.id)

        from fastapi import HTTPException
        import pytest
        with pytest.raises(HTTPException) as exc:
            create_stain_run(db, stainer_id="ST-1", stain_ids=[stain.id], run_no="RUN-DUP", user_id=registrar.id)
        assert exc.value.status_code == 400


class TestGetAllStainRuns:
    def test_returns_created_runs(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        stain = create_stain(db, NongyneStainCreate(case_id=case.id, test_id=_test_id(db)))
        run = create_stain_run(db, stainer_id="ST-1", stain_ids=[stain.id], run_no="RUN-LIST-1", user_id=registrar.id)

        result_ids = [r.id for r in get_all_stain_runs(db, limit=1000)]
        assert run.id in result_ids
