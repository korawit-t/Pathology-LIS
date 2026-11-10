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
from app.models.slide_dispatch import SlideDispatchItem, SlideDispatchRun

from tests.factories import (
    make_signable_case,
    make_bare_nongyne_case,
    make_anatomical_pathology_test,
    make_block,
    make_block_stain,
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


def _surgical_case_with_stains(db, registrar_id, *block_stain_statuses):
    """A slide-prepped surgical case with one block per tuple in
    block_stain_statuses, each block getting one stain per status listed."""
    case, specimen = make_signable_case(db, registrar_id=registrar_id)
    case.is_slide_prepped = True
    db.commit()
    for block_no, statuses in enumerate(block_stain_statuses, start=1):
        block = make_block(db, specimen.id, block_no=block_no, status="stained")
        for slide_no, status in enumerate(statuses, start=1):
            make_block_stain(db, block.id, slide_no=slide_no, status=status)
    return case, specimen


class TestSlideCount:
    """The dispatch note prints how many slides each case hands over, and the
    total — snapshotted on the item when the case is dispatched."""

    def test_surgical_counts_only_stained_slides(self, db, admin_user):
        registrar, _ = admin_user
        # A1: H&E stained + a special stain still pending
        # A2: H&E completed + a recut stained + an IHC out at the outlab
        case, _ = _surgical_case_with_stains(
            db, registrar.id,
            ("stained", "pending"),
            ("completed", "stained", "sent"),
        )

        result = verify_accession_for_dispatch(db, case.accession_no)

        assert result["slide_count"] == 3

    def test_nongyne_counts_stained_slides(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        for status in ("stained", "completed", "pending"):
            create_nongyne_stain(db, NongyneStainCreate(case_id=case.id, test_id=ap_test.id, status=status))

        result = verify_accession_for_dispatch(db, case.accession_no)

        assert result["slide_count"] == 2

    def test_dispatch_snapshots_counts_and_total(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        surg_case, _ = _surgical_case_with_stains(db, registrar.id, ("stained",), ("stained",))
        nongyne_case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        create_nongyne_stain(db, NongyneStainCreate(case_id=nongyne_case.id, test_id=ap_test.id, status="stained"))

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

        counts = {item.case_type: item.slide_count for item in run.items}
        assert counts == {"SURGICAL": 2, "NONGYNE_CYTO": 1}
        assert run.total_slides == 3

    def test_slides_stained_after_dispatch_do_not_change_the_note(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = _surgical_case_with_stains(db, registrar.id, ("stained",))
        run = create_bulk_slide_dispatch(
            db,
            SlideDispatchBulkCreate(
                items=[DispatchItemCreate(case_id=case.id, case_type="SURGICAL")],
                pathologist_id=path1.id,
            ),
            sender_id=registrar.id,
        )

        # A special stain ordered and finished after the slides went out
        later_block = make_block(db, specimen.id, block_no=9, status="stained")
        make_block_stain(db, later_block.id, status="stained")

        listed = get_slide_dispatches(db, limit=100)["items"]
        reloaded = next(r for r in listed if r.id == run.id)
        assert reloaded.items[0].slide_count == 1
        assert reloaded.total_slides == 1

    def test_total_unknown_when_an_item_predates_the_snapshot(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, _ = _surgical_case_with_stains(db, registrar.id, ("stained",))
        run = create_bulk_slide_dispatch(
            db,
            SlideDispatchBulkCreate(
                items=[DispatchItemCreate(case_id=case.id, case_type="SURGICAL")],
                pathologist_id=path1.id,
            ),
            sender_id=registrar.id,
        )
        # Rows saved before the column existed hold NULL
        db.query(SlideDispatchItem).filter(SlideDispatchItem.run_id == run.id).update({"slide_count": None})
        db.commit()
        db.refresh(run)

        assert run.total_slides is None
