"""Tests for app/crud/slide_storage.py — slide storage/dispose lifecycle
across Surgical (H&E/IHC/Special), Gyne, and NonGyne stains."""

from app.crud.slide_storage import (
    generate_slide_storage_run_number,
    get_pending_storage_slides_tree,
    get_pending_gyne_slides_tree,
    get_pending_nongyne_slides_tree,
    create_slide_storage_run_batch,
    dispose_slide_details,
    delete_slide_storage_run,
)
from app.schemas.slide_storage import SlideStorageRunCreateBatch, SlideStorageDetailCreate
from app.utils.slide_barcode import (
    KIND_GYNE,
    KIND_SURGICAL,
    legacy_slide_qr_payload,
    pad_block_code,
    slide_label_code,
)
from app.models.slide_storage import SlideStorageDetail, SlideStorageRun
from app.crud.gyne_cyto_stain import create_stain as create_gyne_stain
from app.schemas.gyne_cyto_stain import GyneStainCreate

from tests.factories import (
    make_signable_case,
    make_block,
    make_block_stain,
    make_anatomical_pathology_test,
    make_bare_gyne_case,
)


class TestGenerateRunNumber:
    def test_first_run_of_the_day(self, db):
        db.query(SlideStorageDetail).delete()
        db.query(SlideStorageRun).delete()
        db.commit()
        assert generate_slide_storage_run_number(db).endswith("-001")


class TestPendingStorageSlidesTree:
    def test_default_tree_excludes_already_stored(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        already_stored = make_block_stain(db, block.id, status="stained")
        still_pending = make_block_stain(db, block.id, slide_no=2, status="stained")
        not_yet_stained = make_block_stain(db, block.id, slide_no=3, status="pending")

        create_slide_storage_run_batch(
            db,
            SlideStorageRunCreateBatch(
                user_id=registrar.id, items=[SlideStorageDetailCreate(stain_id=already_stored.id)]
            ),
        )

        tree = get_pending_storage_slides_tree(db)
        case_node = next((c for c in tree if c["id"] == case.id), None)
        assert case_node is not None
        ids_in_tree = {child["id"] for child in case_node["children"]}
        assert already_stored.id not in ids_in_tree  # already stored
        assert not_yet_stained.id not in ids_in_tree  # not stained yet
        assert still_pending.id in ids_in_tree  # stained, not yet stored

    def test_he_category_filters_by_system_code(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        he_test = make_anatomical_pathology_test(db, system_code="HE_ROUTINE", category="Histology")
        other_test = make_anatomical_pathology_test(db, category="IHC")
        he_stain = make_block_stain(db, block.id, test_id=he_test.id, status="stained")
        ihc_stain = make_block_stain(db, block.id, test_id=other_test.id, slide_no=2, status="stained")

        tree = get_pending_storage_slides_tree(db, stain_category="HE")
        case_node = next((c for c in tree if c["id"] == case.id), None)
        ids_in_tree = {child["id"] for child in case_node["children"]}

        assert he_stain.id in ids_in_tree
        assert ihc_stain.id not in ids_in_tree

    def test_slide_carries_the_barcode_its_sticker_prints(self, db, admin_user):
        """The scan box matches on `barcodes`, so it has to hold the exact QR
        payload generate_slide_sticker_pdf draws — the slide's own id."""
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = make_block_stain(db, block.id, status="stained")

        tree = get_pending_storage_slides_tree(db)
        case_node = next(c for c in tree if c["id"] == case.id)
        node = next(child for child in case_node["children"] if child["id"] == stain.id)

        assert slide_label_code(KIND_SURGICAL, stain.id) in node["barcodes"]

    def test_slide_still_accepts_the_accession_block_stickers_in_the_drawers(
        self, db, admin_user
    ):
        """Slides filed before they carried ids have an accession+block QR on
        them. Scanning one used to report "not found" because the readable
        `code` label ("S26-1 A1 (H&E #1)") never contains the printed payload
        ("S26-1A01"), and it still has to resolve."""
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = make_block_stain(db, block.id, status="stained")

        tree = get_pending_storage_slides_tree(db)
        case_node = next(c for c in tree if c["id"] == case.id)
        node = next(child for child in case_node["children"] if child["id"] == stain.id)

        padded = legacy_slide_qr_payload(
            case.accession_no, pad_block_code(block.block_code)
        )
        assert padded in node["barcodes"]
        # the unpadded code older stickers went out with still scans
        assert legacy_slide_qr_payload(case.accession_no, block.block_code) in node["barcodes"]
        assert padded not in node["code"]  # why matching on the label failed

    def test_barcodes_carry_the_lab_namespace_when_one_is_set(self, db, admin_user):
        """A sticker printed by an installation with a lab_code is namespaced,
        and the bare id keeps working so renaming the lab never orphans one."""
        from app.models.system_setting import SystemSetting

        master = (
            db.query(SystemSetting)
            .filter(SystemSetting.hospital_slug == "master")
            .first()
        )
        if master is None:
            master = SystemSetting(hospital_slug="master")
            db.add(master)
        master.lab_code = "BKK01"
        db.commit()
        try:
            registrar, _ = admin_user
            case, specimen = make_signable_case(db, registrar_id=registrar.id)
            block = make_block(db, specimen.id)
            stain = make_block_stain(db, block.id, status="stained")

            tree = get_pending_storage_slides_tree(db)
            case_node = next(c for c in tree if c["id"] == case.id)
            node = next(c for c in case_node["children"] if c["id"] == stain.id)

            assert f"BKK01-SBS-{stain.id}" in node["barcodes"]
            assert f"SBS-{stain.id}" in node["barcodes"]
        finally:
            master.lab_code = None
            db.commit()

    def test_cytology_slide_barcode_is_its_own_id(self, db, admin_user):
        """A cytology slide has no block, so the composite payload could only
        ever name the case — its id is what identifies the slide."""
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        stain = create_gyne_stain(
            db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, status="stained")
        )

        tree = get_pending_gyne_slides_tree(db)
        case_node = next(c for c in tree if c["id"] == case.id)
        node = next(child for child in case_node["children"] if child["id"] == stain.id)

        assert slide_label_code(KIND_GYNE, stain.id) in node["barcodes"]
        assert legacy_slide_qr_payload(case.accession_no, f"#{stain.slide_no}") in node["barcodes"]

    def test_gyne_tree_only_stained_and_not_stored(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        stained = create_gyne_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id, status="stained"))

        tree = get_pending_gyne_slides_tree(db)
        case_node = next((c for c in tree if c["id"] == case.id), None)
        assert case_node is not None
        assert any(child["id"] == stained.id for child in case_node["children"])


class TestCreateSlideStorageRunBatch:
    def test_surgical_batch_creates_stain_detail(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = make_block_stain(db, block.id, status="stained")

        run = create_slide_storage_run_batch(
            db, SlideStorageRunCreateBatch(user_id=registrar.id, items=[SlideStorageDetailCreate(stain_id=stain.id)])
        )

        detail = db.query(SlideStorageDetail).filter(SlideStorageDetail.run_id == run.id).first()
        assert detail.stain_id == stain.id
        assert detail.gyne_stain_id is None
        assert detail.nongyne_stain_id is None

    def test_gyne_batch_creates_gyne_stain_detail(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        stain = create_gyne_stain(db, GyneStainCreate(case_id=case.id, test_id=ap_test.id))

        run = create_slide_storage_run_batch(
            db,
            SlideStorageRunCreateBatch(
                user_id=registrar.id, stain_category="Gyne", items=[SlideStorageDetailCreate(stain_id=stain.id)]
            ),
        )

        detail = db.query(SlideStorageDetail).filter(SlideStorageDetail.run_id == run.id).first()
        assert detail.gyne_stain_id == stain.id
        assert detail.stain_id is None


class TestDisposeAndDeleteSlideStorage:
    def test_dispose_marks_discarded(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = make_block_stain(db, block.id, status="stained")
        run = create_slide_storage_run_batch(
            db, SlideStorageRunCreateBatch(user_id=registrar.id, items=[SlideStorageDetailCreate(stain_id=stain.id)])
        )
        detail = db.query(SlideStorageDetail).filter(SlideStorageDetail.run_id == run.id).first()

        result = dispose_slide_details(db, [detail.id], user_id=registrar.id)

        assert result[0].discard_status is True
        assert result[0].discard_by_id == registrar.id

    def test_delete_run_removes_details(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id)
        stain = make_block_stain(db, block.id, status="stained")
        run = create_slide_storage_run_batch(
            db, SlideStorageRunCreateBatch(user_id=registrar.id, items=[SlideStorageDetailCreate(stain_id=stain.id)])
        )

        result = delete_slide_storage_run(db, run.id)

        assert result is True
        assert db.query(SlideStorageRun).filter(SlideStorageRun.id == run.id).first() is None
        assert db.query(SlideStorageDetail).filter(SlideStorageDetail.run_id == run.id).count() == 0

    def test_delete_missing_run_returns_false(self, db):
        assert delete_slide_storage_run(db, 999999) is False
