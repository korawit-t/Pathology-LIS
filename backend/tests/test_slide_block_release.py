"""Tests for app/crud/slide_block_release.py — accession verification guard
(must be reported) and the create/delete release lifecycle, including
delete_release's recompute-remaining-flags logic."""

import uuid
import pytest
from fastapi import HTTPException

from app.crud.slide_block_release import (
    generate_release_no,
    verify_accession_for_release,
    create_release,
    delete_release,
)
from app.schemas.slide_block_release import SlideBlockReleaseCreate
from app.models.slide_block_release import SlideBlockRelease

from tests.factories import make_signable_case, make_bare_gyne_case, make_bare_nongyne_case


class TestGenerateReleaseNo:
    def test_first_of_the_year(self, db):
        db.query(SlideBlockRelease).delete()
        db.commit()
        assert generate_release_no(db).endswith("-0001")


class TestVerifyAccessionForRelease:
    def test_surgical_not_reported_raises_400(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        with pytest.raises(HTTPException) as exc:
            verify_accession_for_release(db, case.accession_no)
        assert exc.value.status_code == 400

    def test_surgical_reported_returns_data(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_reported = True
        db.commit()

        result = verify_accession_for_release(db, case.accession_no)
        assert result["case_type"] == "SURGICAL"
        assert result["is_slide_released"] is False
        assert result["is_block_released"] is False

    def test_gyne_not_reported_raises_400(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        with pytest.raises(HTTPException) as exc:
            verify_accession_for_release(db, case.accession_no)
        assert exc.value.status_code == 400

    def test_gyne_reported_returns_data_with_block_released_always_false(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        case.is_reported = True
        db.commit()

        result = verify_accession_for_release(db, case.accession_no)
        assert result["case_type"] == "GYNE_CYTO"
        assert result["is_block_released"] is False  # always False for non-Surgical

    def test_nongyne_reported_returns_data(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        case.is_reported = True
        db.commit()

        result = verify_accession_for_release(db, case.accession_no)
        assert result["case_type"] == "NONGYNE_CYTO"

    def test_not_found_raises_404(self, db):
        with pytest.raises(HTTPException) as exc:
            verify_accession_for_release(db, f"NO-SUCH-{uuid.uuid4().hex[:8]}")
        assert exc.value.status_code == 404


class TestCreateRelease:
    def test_slide_release_sets_slide_flag_only(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_reported = True
        db.commit()

        create_release(
            db,
            SlideBlockReleaseCreate(
                case_id=case.id, case_type="SURGICAL", release_type="SLIDE", recipient_name="Dr. X"
            ),
            released_by_id=registrar.id,
        )

        db.refresh(case)
        assert case.is_slide_released is True
        assert case.is_block_released is False

    def test_both_release_sets_both_flags_for_surgical(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_reported = True
        db.commit()

        create_release(
            db,
            SlideBlockReleaseCreate(
                case_id=case.id, case_type="SURGICAL", release_type="BOTH", recipient_name="Dr. X"
            ),
            released_by_id=registrar.id,
        )

        db.refresh(case)
        assert case.is_slide_released is True
        assert case.is_block_released is True

    def test_block_release_on_gyne_does_not_set_any_case_flag(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        case.is_reported = True
        db.commit()

        release = create_release(
            db,
            SlideBlockReleaseCreate(
                case_id=case.id, case_type="GYNE_CYTO", release_type="BLOCK", recipient_name="Dr. X"
            ),
            released_by_id=registrar.id,
        )

        assert release.id is not None
        db.refresh(case)
        assert case.is_slide_released is False  # BLOCK-only request, Gyne has no block concept


class TestDeleteReleaseRecomputesFlags:
    def test_flag_stays_true_while_another_release_remains(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_reported = True
        db.commit()
        r1 = create_release(
            db, SlideBlockReleaseCreate(case_id=case.id, case_type="SURGICAL", release_type="SLIDE", recipient_name="A"),
            released_by_id=registrar.id,
        )
        r2 = create_release(
            db, SlideBlockReleaseCreate(case_id=case.id, case_type="SURGICAL", release_type="SLIDE", recipient_name="B"),
            released_by_id=registrar.id,
        )

        delete_release(db, r1.id)

        db.refresh(case)
        assert case.is_slide_released is True  # r2 still exists

    def test_flag_flips_false_once_last_release_deleted(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_reported = True
        db.commit()
        release = create_release(
            db, SlideBlockReleaseCreate(case_id=case.id, case_type="SURGICAL", release_type="BOTH", recipient_name="A"),
            released_by_id=registrar.id,
        )

        result = delete_release(db, release.id)

        assert result is True
        db.refresh(case)
        assert case.is_slide_released is False
        assert case.is_block_released is False

    def test_missing_release_returns_false(self, db):
        assert delete_release(db, 999999) is False
