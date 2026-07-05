"""Tests for app/crud/slide_dispatch.py — dispatch-no generation, accession
verification guard, and the bulk dispatch/delete lifecycle."""

import uuid
import pytest
from fastapi import HTTPException

from app.crud.slide_dispatch import (
    generate_dispatch_no,
    verify_accession_for_dispatch,
    create_bulk_slide_dispatch,
    get_slide_dispatches,
    delete_slide_dispatch,
)
from app.schemas.slide_dispatch import SlideDispatchBulkCreate, DispatchItemCreate
from app.crud.nongyne_cyto_stain import create_stain as create_nongyne_stain
from app.schemas.nongyne_cyto_stain import NongyneStainCreate
from app.models.slide_dispatch import SlideDispatchRun

from tests.factories import (
    make_signable_case,
    make_bare_nongyne_case,
    make_anatomical_pathology_test,
)


class TestGenerateDispatchNo:
    def test_first_of_the_day(self, db):
        db.query(SlideDispatchRun).delete()
        db.commit()
        assert generate_dispatch_no(db).endswith("0001")


class TestVerifyAccessionForDispatch:
    def test_surgical_not_yet_stained_raises_400(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        with pytest.raises(HTTPException) as exc:
            verify_accession_for_dispatch(db, case.accession_no)
        assert exc.value.status_code == 400

    def test_surgical_slide_prepped_returns_specimens_and_blocks(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_slide_prepped = True
        db.commit()

        result = verify_accession_for_dispatch(db, case.accession_no)

        assert result["case_type"] == "SURGICAL"
        assert result["id"] == case.id
        assert len(result["specimens"]) == 1

    def test_surgical_status_stained_also_allowed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.status = "stained"
        db.commit()

        result = verify_accession_for_dispatch(db, case.accession_no)
        assert result["case_type"] == "SURGICAL"

    def test_nongyne_without_stained_stain_raises_400(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        with pytest.raises(HTTPException) as exc:
            verify_accession_for_dispatch(db, case.accession_no)
        assert exc.value.status_code == 400

    def test_nongyne_with_stained_stain_returns_case(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        create_nongyne_stain(db, NongyneStainCreate(case_id=case.id, test_id=ap_test.id, status="stained"))

        result = verify_accession_for_dispatch(db, case.accession_no)
        assert result["case_type"] == "NONGYNE_CYTO"

    def test_not_found_raises_404(self, db):
        with pytest.raises(HTTPException) as exc:
            verify_accession_for_dispatch(db, f"NO-SUCH-{uuid.uuid4().hex[:8]}")
        assert exc.value.status_code == 404


class TestBulkDispatchLifecycle:
    def test_create_updates_surgical_and_nongyne_case_status(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        surg_case, specimen = make_signable_case(db, registrar_id=registrar.id)
        surg_case.is_slide_prepped = True
        nongyne_case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        db.commit()

        run = create_bulk_slide_dispatch(
            db,
            SlideDispatchBulkCreate(
                items=[
                    DispatchItemCreate(case_id=surg_case.id, case_type="SURGICAL"),
                    DispatchItemCreate(case_id=nongyne_case.id, case_type="NONGYNE_CYTO"),
                ],
                pathologist_id=path1.id,
            ),
            sender_id=registrar.id,
        )

        assert run.total_cases == 2
        db.refresh(surg_case)
        db.refresh(nongyne_case)
        assert surg_case.status == "slide sent"
        assert surg_case.pathologist_id == path1.id
        assert nongyne_case.status == "slide sent"
        assert nongyne_case.pathologist_id == path1.id

    def test_delete_reverts_case_status_and_clears_pathologist(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        surg_case, specimen = make_signable_case(db, registrar_id=registrar.id)
        surg_case.is_slide_prepped = True
        db.commit()
        run = create_bulk_slide_dispatch(
            db,
            SlideDispatchBulkCreate(
                items=[DispatchItemCreate(case_id=surg_case.id, case_type="SURGICAL")],
                pathologist_id=path1.id,
            ),
            sender_id=registrar.id,
        )

        result = delete_slide_dispatch(db, run.id)

        assert result is True
        db.refresh(surg_case)
        assert surg_case.status == "stained"
        assert surg_case.pathologist_id is None
        assert db.query(SlideDispatchRun).filter(SlideDispatchRun.id == run.id).first() is None

    def test_delete_missing_run_returns_false(self, db):
        assert delete_slide_dispatch(db, 999999) is False
