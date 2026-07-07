"""Tests for app/crud/microscopic_image.py — thin CRUD, kept lean. The only
non-trivial behavior is get_multi_by_specimen's per-specimen scoping + sort
order, and delete_micro_image's no-op-on-missing-id guard."""

from app.crud.microscopic_image import create_micro_image, get_multi_by_specimen, delete_micro_image
from app.schemas.microscopic_image import MicroscopicImageCreate
from app.models.microscopic_image import MicroscopicImage

from tests.factories import make_signable_case


def _image(sort_order: int = 1, **overrides) -> MicroscopicImageCreate:
    return MicroscopicImageCreate(image_url=f"/uploads/img{sort_order}.jpg", sort_order=sort_order, **overrides)


class TestCreate:
    def test_binds_specimen_and_uploader_from_params_not_payload(self, db, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        result = create_micro_image(db, _image(), specimen_id=specimen.id, uploader_id=registrar.id)

        assert result.specimen_id == specimen.id
        assert result.uploaded_by_id == registrar.id
        assert result.image_url == "/uploads/img1.jpg"


class TestGetMultiBySpecimen:
    def test_scopes_to_the_given_specimen_and_orders_by_sort_order(self, db, admin_user):
        registrar, _ = admin_user
        _, specimen_a = make_signable_case(db, registrar_id=registrar.id)
        _, specimen_b = make_signable_case(db, registrar_id=registrar.id)
        create_micro_image(db, _image(sort_order=2), specimen_id=specimen_a.id, uploader_id=registrar.id)
        create_micro_image(db, _image(sort_order=1), specimen_id=specimen_a.id, uploader_id=registrar.id)
        create_micro_image(db, _image(sort_order=1), specimen_id=specimen_b.id, uploader_id=registrar.id)

        result = get_multi_by_specimen(db, specimen_a.id)

        assert [r.sort_order for r in result] == [1, 2]
        assert all(r.specimen_id == specimen_a.id for r in result)

    def test_returns_empty_for_a_specimen_with_no_images(self, db, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        assert get_multi_by_specimen(db, specimen.id) == []


class TestDelete:
    def test_deletes_an_existing_image(self, db, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        img = create_micro_image(db, _image(), specimen_id=specimen.id, uploader_id=registrar.id)

        result = delete_micro_image(db, img.id)

        assert result.id == img.id
        assert db.query(MicroscopicImage).filter(MicroscopicImage.id == img.id).first() is None

    def test_missing_id_is_a_no_op(self, db):
        assert delete_micro_image(db, 999999) is None
