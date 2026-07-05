"""Tests for app/crud/wsi_file.py — filename parsing and auto-matching whole
slide image files to blocks/specimens/cases. A wrong match here links the
wrong slide to the wrong case (a real patient-safety risk), so
parse_filename and auto_match_file get thorough coverage."""

import uuid

from app.crud.wsi_file import (
    parse_filename,
    auto_match_file,
    discover_and_upsert_files,
    run_scan_and_match,
    get_wsi_files,
    get_block_confirmed_slides,
    get_case_confirmed_slides,
)
from app.models.wsi_setting import WsiScannerProfile, WsiSetting
from app.models.wsi_file import WsiFile
from app.models.wsi_slide_link import WsiSlideLink

from tests.factories import make_signable_case, make_block


def _make_profile(db, pattern="{accession}_{block}", separator="_", extensions=None):
    profile = WsiScannerProfile(
        name=f"Scanner-{uuid.uuid4().hex[:6]}",
        filename_pattern=pattern,
        separator=separator,
        file_extensions=extensions or ["svs"],
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def _make_wsi_file(db, filename, parsed_accession=None, parsed_block=None, confidence="failed"):
    wsi = WsiFile(
        file_path=f"/fake/{uuid.uuid4().hex}/{filename}",
        filename=filename,
        parsed_accession=parsed_accession,
        parsed_block=parsed_block,
        parse_confidence=confidence,
    )
    db.add(wsi)
    db.commit()
    db.refresh(wsi)
    return wsi


class TestParseFilename:
    def test_pattern_missing_placeholders_fails(self, db):
        profile = _make_profile(db, pattern="{block}_only")
        result = parse_filename("S26-001_A1.svs", profile)
        assert result == (None, None, "failed")

    def test_accession_before_block(self, db):
        profile = _make_profile(db, pattern="{accession}_{block}")
        accession, block, confidence = parse_filename("S26-001_A1.svs", profile)
        assert accession == "S26-001"
        assert block == "A1"
        assert confidence == "high"

    def test_block_before_accession(self, db):
        profile = _make_profile(db, pattern="{block}_{accession}")
        accession, block, confidence = parse_filename("A1_S26-001.svs", profile)
        assert accession == "S26-001"
        assert block == "A1"
        assert confidence == "high"

    def test_invalid_block_code_format_is_low_confidence(self, db):
        profile = _make_profile(db, pattern="{accession}_{block}")
        accession, block, confidence = parse_filename("S26-001_notablock.svs", profile)
        assert confidence == "low"
        assert block is None

    def test_no_separator_found_fails(self, db):
        profile = _make_profile(db, pattern="{accession}_{block}", separator="_")
        accession, block, confidence = parse_filename("S26001A1.svs", profile)
        assert (accession, block, confidence) == (None, None, "failed")

    def test_empty_accession_is_low_confidence(self, db):
        profile = _make_profile(db, pattern="{accession}_{block}")
        accession, block, confidence = parse_filename("_A1.svs", profile)
        assert confidence == "low"
        assert accession is None


class TestAutoMatchFile:
    def test_low_confidence_file_never_matched(self, db, admin_user):
        wsi = _make_wsi_file(db, "x.svs", parsed_accession="S26-1", parsed_block="A1", confidence="low")
        assert auto_match_file(db, wsi) is False

    def test_missing_accession_or_block_never_matched(self, db):
        wsi = _make_wsi_file(db, "x.svs", parsed_accession=None, parsed_block="A1", confidence="high")
        assert auto_match_file(db, wsi) is False

    def test_malformed_block_code_never_matched(self, db):
        wsi = _make_wsi_file(db, "x.svs", parsed_accession="S26-1", parsed_block="NOTVALID", confidence="high")
        assert auto_match_file(db, wsi) is False

    def test_case_not_found_returns_false(self, db):
        wsi = _make_wsi_file(db, "x.svs", parsed_accession=f"NO-SUCH-{uuid.uuid4().hex[:8]}", parsed_block="A1", confidence="high")
        assert auto_match_file(db, wsi) is False

    def test_specimen_label_mismatch_returns_false(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)  # specimen_label="A"
        wsi = _make_wsi_file(db, "x.svs", parsed_accession=case.accession_no, parsed_block="B1", confidence="high")
        assert auto_match_file(db, wsi) is False

    def test_block_number_mismatch_returns_false(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        make_block(db, specimen.id, block_no=1)
        wsi = _make_wsi_file(db, "x.svs", parsed_accession=case.accession_no, parsed_block="A2", confidence="high")
        assert auto_match_file(db, wsi) is False

    def test_successful_match_creates_pending_link(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, block_no=1)
        wsi = _make_wsi_file(db, "x.svs", parsed_accession=case.accession_no, parsed_block="A1", confidence="high")

        result = auto_match_file(db, wsi)

        assert result is True
        link = db.query(WsiSlideLink).filter(WsiSlideLink.wsi_file_id == wsi.id).first()
        assert link is not None
        assert link.surgical_block_id == block.id
        assert link.status == "pending"
        assert link.link_method == "auto_filename"

    def test_existing_link_is_idempotent(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, block_no=1)
        wsi = _make_wsi_file(db, "x.svs", parsed_accession=case.accession_no, parsed_block="A1", confidence="high")
        auto_match_file(db, wsi)

        result = auto_match_file(db, wsi)  # call again

        assert result is True
        links = db.query(WsiSlideLink).filter(WsiSlideLink.wsi_file_id == wsi.id).all()
        assert len(links) == 1  # not duplicated


class TestDiscoverAndUpsertFiles:
    def test_discovers_new_matching_extension_only(self, db, tmp_path):
        profile = _make_profile(db, extensions=["svs"])
        (tmp_path / "slide.svs").write_bytes(b"fake")
        (tmp_path / "notes.txt").write_bytes(b"ignore me")

        discovered, updated = discover_and_upsert_files(db, str(tmp_path), profile)

        assert discovered == 1
        assert updated == 0
        wsi = db.query(WsiFile).filter(WsiFile.filename == "slide.svs").first()
        assert wsi is not None

    def test_rescanning_same_file_updates_instead_of_duplicating(self, db, tmp_path):
        # Scoped by file_path (unique, and tmp_path is fresh per test) rather
        # than filename — "slide.svs" as a bare filename is reused by a
        # sibling test in a different tmp_path, so filtering by filename
        # alone would double-count across tests.
        profile = _make_profile(db, extensions=["svs"])
        file_path = str(tmp_path / "slide.svs")
        (tmp_path / "slide.svs").write_bytes(b"fake")
        discover_and_upsert_files(db, str(tmp_path), profile)

        discovered, updated = discover_and_upsert_files(db, str(tmp_path), profile)

        assert discovered == 0
        assert updated == 1
        assert db.query(WsiFile).filter(WsiFile.file_path == file_path).count() == 1


class TestRunScanAndMatch:
    def test_missing_root_path_returns_zeros(self, db):
        settings = WsiSetting(wsi_root_path=None)
        result = run_scan_and_match(db, settings)
        assert result == {"discovered": 0, "updated": 0, "auto_linked": 0, "pending_review": 0}

    def test_full_scan_discovers_and_auto_links(self, db, admin_user, tmp_path):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        make_block(db, specimen.id, block_no=1)
        profile = _make_profile(db, pattern="{accession}_{block}", extensions=["svs"])
        (tmp_path / f"{case.accession_no}_A1.svs").write_bytes(b"fake")
        settings = WsiSetting(wsi_root_path=str(tmp_path))
        settings.default_scanner_profile = profile

        result = run_scan_and_match(db, settings)

        assert result["discovered"] == 1
        assert result["auto_linked"] == 1
        assert result["pending_review"] >= 1


class TestGetters:
    def test_get_wsi_files_unlinked_only_filter(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, block_no=1)
        linked = _make_wsi_file(db, "linked.svs")
        db.add(WsiSlideLink(wsi_file_id=linked.id, surgical_block_id=block.id, status="pending"))
        unlinked = _make_wsi_file(db, "unlinked.svs")
        db.commit()

        result_ids = [f.id for f in get_wsi_files(db, unlinked_only=True)]
        assert unlinked.id in result_ids
        assert linked.id not in result_ids

    def test_get_block_confirmed_slides_only_confirmed(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, block_no=1)
        confirmed = _make_wsi_file(db, "confirmed.svs")
        pending = _make_wsi_file(db, "pending.svs")
        db.add(WsiSlideLink(wsi_file_id=confirmed.id, surgical_block_id=block.id, status="confirmed"))
        db.add(WsiSlideLink(wsi_file_id=pending.id, surgical_block_id=block.id, status="pending"))
        db.commit()

        results = get_block_confirmed_slides(db, block.id)
        assert confirmed.id in [f.id for f in results]
        assert pending.id not in [f.id for f in results]

    def test_get_case_confirmed_slides_deduplicates(self, db, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = make_block(db, specimen.id, block_no=1)
        wsi = _make_wsi_file(db, "confirmed.svs")
        db.add(WsiSlideLink(wsi_file_id=wsi.id, surgical_block_id=block.id, status="confirmed", stain_type="HE"))
        db.add(WsiSlideLink(wsi_file_id=wsi.id, surgical_block_id=block.id, status="confirmed", stain_type="IHC"))
        db.commit()

        results = get_case_confirmed_slides(db, case.id)
        assert [f.id for f in results].count(wsi.id) == 1
