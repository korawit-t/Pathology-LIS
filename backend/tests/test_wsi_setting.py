"""Tests for app/crud/wsi_setting.py. WsiSetting is a per-hospital-slug
singleton with a get-or-create pattern in both get_wsi_settings (recursive
self-call after creating) and update_wsi_settings (create-then-update) —
worth confirming neither ever produces a duplicate row. Scanner profile CRUD
underneath is thin and gets lighter coverage."""

from app.crud.wsi_setting import (
    get_wsi_settings,
    update_wsi_settings,
    get_all_profiles,
    create_profile,
    update_profile,
    delete_profile,
)
from app.schemas.wsi_setting import WsiSettingUpdate, WsiScannerProfileCreate, WsiScannerProfileUpdate
from app.models.wsi_setting import WsiSetting


class TestGetWsiSettings:
    def test_auto_creates_the_singleton_on_first_access(self, db):
        result = get_wsi_settings(db, hospital_slug="master")

        assert result.hospital_slug == "master"
        assert db.query(WsiSetting).filter(WsiSetting.hospital_slug == "master").count() == 1

    def test_second_call_reuses_the_same_row(self, db):
        first = get_wsi_settings(db, hospital_slug="master")
        second = get_wsi_settings(db, hospital_slug="master")

        assert first.id == second.id
        assert db.query(WsiSetting).filter(WsiSetting.hospital_slug == "master").count() == 1

    def test_different_hospital_slugs_get_separate_rows(self, db):
        a = get_wsi_settings(db, hospital_slug="hosp-a")
        b = get_wsi_settings(db, hospital_slug="hosp-b")

        assert a.id != b.id


class TestUpdateWsiSettings:
    def test_creates_and_applies_fields_when_no_row_exists_yet(self, db):
        result = update_wsi_settings(db, WsiSettingUpdate(wsi_root_path="/data/wsi"), hospital_slug="master")

        assert result.wsi_root_path == "/data/wsi"
        assert db.query(WsiSetting).filter(WsiSetting.hospital_slug == "master").count() == 1

    def test_updates_the_existing_row_without_duplicating(self, db):
        get_wsi_settings(db, hospital_slug="master")

        update_wsi_settings(db, WsiSettingUpdate(wsi_root_path="/data/wsi"), hospital_slug="master")

        assert db.query(WsiSetting).filter(WsiSetting.hospital_slug == "master").count() == 1


class TestScannerProfiles:
    def test_create_get_update_delete_round_trip(self, db):
        profile = create_profile(
            db, WsiScannerProfileCreate(name="Aperio", filename_pattern="{accession}_{block}"),
        )
        assert profile in get_all_profiles(db)

        updated = update_profile(db, profile, WsiScannerProfileUpdate(is_active=False))
        assert updated.is_active is False

        delete_profile(db, profile)
        assert profile not in get_all_profiles(db)
