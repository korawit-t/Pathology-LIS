"""Tests for app/crud/wsi_slide_link.py. The one branch worth real coverage:
update_link only stamps confirmed_by_id/confirmed_at when the *incoming*
payload's status is "confirmed" — not when the link happens to already be
confirmed, and not for any other status value (e.g. "rejected")."""

from app.models.wsi_file import WsiFile
from app.crud.wsi_slide_link import get_links, get_link_by_id, create_link, update_link, delete_link
from app.schemas.wsi_slide_link import WsiSlideLinkCreate, WsiSlideLinkUpdate

from tests.factories import make_signable_case, make_block


def _wsi_file(db, **overrides) -> WsiFile:
    import uuid
    f = WsiFile(file_path=f"/data/{uuid.uuid4().hex}.svs", filename="slide.svs", **overrides)
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


class TestCreateLink:
    def test_sets_method_and_default_confidence(self, db, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)

        result = create_link(
            db, WsiSlideLinkCreate(wsi_file_id=wsi_file.id, surgical_block_id=block.id),
            linked_by_id=registrar.id, method="auto_filename",
        )

        assert result.link_method == "auto_filename"
        assert float(result.link_confidence) == 1.0
        assert result.linked_by_id == registrar.id
        assert result.status == "pending"


class TestGetLinks:
    def test_filters_by_status(self, db, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)
        link = create_link(db, WsiSlideLinkCreate(wsi_file_id=wsi_file.id, surgical_block_id=block.id))
        update_link(db, link, WsiSlideLinkUpdate(status="rejected"))

        pending = get_links(db, status="pending")
        rejected = get_links(db, status="rejected")

        assert link.id not in {l.id for l in pending}
        assert link.id in {l.id for l in rejected}


class TestUpdateLink:
    def test_confirming_stamps_confirmed_by_and_confirmed_at(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)
        link = create_link(db, WsiSlideLinkCreate(wsi_file_id=wsi_file.id, surgical_block_id=block.id), linked_by_id=path1.id)

        result = update_link(db, link, WsiSlideLinkUpdate(status="confirmed"), confirmed_by_id=path2.id)

        assert result.status == "confirmed"
        assert result.confirmed_by_id == path2.id
        assert result.confirmed_at is not None

    def test_rejecting_does_not_stamp_confirmed_fields(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)
        link = create_link(db, WsiSlideLinkCreate(wsi_file_id=wsi_file.id, surgical_block_id=block.id), linked_by_id=path1.id)

        result = update_link(db, link, WsiSlideLinkUpdate(status="rejected"), confirmed_by_id=path2.id)

        assert result.status == "rejected"
        assert result.confirmed_by_id is None
        assert result.confirmed_at is None

    def test_updating_an_unrelated_field_on_an_already_confirmed_link_does_not_touch_confirmed_at(
        self, db, admin_user, two_pathologists,
    ):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)
        link = create_link(db, WsiSlideLinkCreate(wsi_file_id=wsi_file.id, surgical_block_id=block.id), linked_by_id=path1.id)
        confirmed = update_link(db, link, WsiSlideLinkUpdate(status="confirmed"), confirmed_by_id=path2.id)
        original_confirmed_at = confirmed.confirmed_at

        result = update_link(db, confirmed, WsiSlideLinkUpdate(notes="added a note"), confirmed_by_id=path2.id)

        assert result.notes == "added a note"
        assert result.confirmed_at == original_confirmed_at


class TestDeleteLink:
    def test_removes_the_link(self, db, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        wsi_file = _wsi_file(db)
        link = create_link(db, WsiSlideLinkCreate(wsi_file_id=wsi_file.id, surgical_block_id=block.id))

        delete_link(db, link)

        assert get_link_by_id(db, link.id) is None
