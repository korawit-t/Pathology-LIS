"""
Tests for app/crud/gyne_cyto_stain.py.

auto_create_default_stain used to be defined TWICE in this file — the second
definition silently shadowed the first (Python keeps only the last `def`),
so the admin-configurable SystemSetting.default_gyne_test_id was always
ignored in favor of a hardcoded system_code="PAP_ROUTINE" lookup. Fixed by
merging into one function that checks the setting first, falling back to
PAP_ROUTINE. test_uses_admin_configured_default_when_set is the regression
test for that bug.
"""

import uuid
import pytest
from fastapi import HTTPException

from app.crud.gyne_cyto_stain import (
    create_stain,
    update_stain,
    auto_create_default_stain,
    create_stain_run,
    get_pending_print_stains,
    get_registered_queue_stains,
)
from app.schemas.gyne_cyto_stain import GyneStainCreate, GyneStainUpdate
from app.models.gyne_cyto_stain import GyneCytologyStain

from tests.factories import (
    make_bare_gyne_case,
    make_system_setting,
    clear_system_settings,
    make_anatomical_pathology_test,
)


class TestAutoCreateDefaultStain:
    def test_uses_admin_configured_default_when_set(self, db, admin_user):
        """Regression test for the duplicate-function bug: the admin's
        SystemSetting.default_gyne_test_id must win even though a
        PAP_ROUTINE test also exists."""
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        configured_test = make_anatomical_pathology_test(db, name="Custom Default")
        make_anatomical_pathology_test(db, system_code="PAP_ROUTINE", name="PAP Routine")
        make_system_setting(db, default_gyne_test_id=configured_test.id)

        stain = auto_create_default_stain(db, case_id=case.id)

        assert stain is not None
        assert stain.test_id == configured_test.id

    def test_falls_back_to_pap_routine_when_no_setting(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        pap_test = make_anatomical_pathology_test(db, system_code="PAP_ROUTINE", name="PAP Routine")
        clear_system_settings(db)

        stain = auto_create_default_stain(db, case_id=case.id)

        assert stain is not None
        assert stain.test_id == pap_test.id

    def test_falls_back_to_pap_routine_when_setting_has_no_test_id(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        pap_test = make_anatomical_pathology_test(db, system_code="PAP_ROUTINE", name="PAP Routine")
        make_system_setting(db, default_gyne_test_id=None)

        stain = auto_create_default_stain(db, case_id=case.id)

        assert stain is not None
        assert stain.test_id == pap_test.id

    def test_returns_none_when_neither_setting_nor_pap_routine_exist(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        clear_system_settings(db)
        # Ensure no PAP_ROUTINE row survives from an earlier test — delete any
        # stains referencing it first (FK), since other tests' stains may
        # still point at a PAP_ROUTINE row created earlier in this session.
        from app.models.anatomical_pathology_test import AnatomicalPathologyTest
        pap_test_ids = [
            row.id for row in db.query(AnatomicalPathologyTest.id).filter(
                AnatomicalPathologyTest.system_code == "PAP_ROUTINE"
            ).all()
        ]
        if pap_test_ids:
            db.query(GyneCytologyStain).filter(GyneCytologyStain.test_id.in_(pap_test_ids)).delete(
                synchronize_session=False
            )
            db.query(AnatomicalPathologyTest).filter(
                AnatomicalPathologyTest.id.in_(pap_test_ids)
            ).delete(synchronize_session=False)
            db.commit()

        stain = auto_create_default_stain(db, case_id=case.id)

        assert stain is None
        assert db.query(GyneCytologyStain).filter(GyneCytologyStain.case_id == case.id).count() == 0


class TestCreateUpdateStain:
    def test_create_stain_persists_fields(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)

        stain = create_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=2))

        assert stain.id is not None
        assert stain.case_id == case.id
        assert stain.slide_no == 2

    def test_update_stain_updates_provided_fields_only(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        stain = create_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=1))

        updated = update_stain(db, stain.id, GyneStainUpdate(status="stained"))

        assert updated.status == "stained"
        assert updated.slide_no == 1  # untouched

    def test_update_missing_stain_returns_none(self, db, admin_user):
        assert update_stain(db, 999999, GyneStainUpdate(status="stained")) is None


class TestCreateStainRun:
    def test_creates_run_and_marks_stains_stained(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        stain = create_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=1))

        run_no = f"RUN-{uuid.uuid4().hex[:8]}"
        run = create_stain_run(
            db, stainer_id="ST-1", stain_ids=[stain.id], run_no=run_no, user_id=registrar.id
        )

        assert run.run_no == run_no
        db.refresh(stain)
        assert stain.status == "stained"
        db.refresh(case)
        assert case.status == "stained"

    def test_duplicate_run_no_raises_400_and_rolls_back(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        stain1 = create_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=1))
        stain2 = create_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=2))

        run_no = f"RUN-{uuid.uuid4().hex[:8]}"
        create_stain_run(db, stainer_id="ST-1", stain_ids=[stain1.id], run_no=run_no, user_id=registrar.id)

        with pytest.raises(HTTPException) as exc:
            create_stain_run(db, stainer_id="ST-1", stain_ids=[stain2.id], run_no=run_no, user_id=registrar.id)
        assert exc.value.status_code == 400

        db.refresh(stain2)
        assert stain2.status == "pending"  # second run's changes were rolled back


class TestStainQueues:
    def test_pending_print_excludes_already_printed(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        unprinted = create_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=1))
        printed = create_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, slide_no=2))
        printed.is_printed = True
        db.commit()

        results = get_pending_print_stains(db)
        result_ids = [s.id for s in results]

        assert unprinted.id in result_ids
        assert printed.id not in result_ids

    def test_registered_queue_only_pending_and_not_out_lab(self, db, admin_user):
        registrar, _ = admin_user
        in_lab_case = make_bare_gyne_case(db, registrar_id=registrar.id)
        out_lab_case = make_bare_gyne_case(db, registrar_id=registrar.id)
        out_lab_case.is_out_lab = True
        db.commit()
        ap_test = make_anatomical_pathology_test(db)

        pending_stain = create_stain(db, GyneStainCreate(case_id=in_lab_case.id, test_id=ap_test.id, slide_no=1))
        stained_stain = create_stain(db, GyneStainCreate(case_id=in_lab_case.id, test_id=ap_test.id, slide_no=2))
        update_stain(db, stained_stain.id, GyneStainUpdate(status="stained"))
        out_lab_stain = create_stain(db, GyneStainCreate(case_id=out_lab_case.id, test_id=ap_test.id, slide_no=1))

        results = get_registered_queue_stains(db)
        result_ids = [s.id for s in results]

        assert pending_stain.id in result_ids
        assert stained_stain.id not in result_ids
        assert out_lab_stain.id not in result_ids
