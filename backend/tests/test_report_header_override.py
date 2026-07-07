"""Tests for the per-hospital report header override: a Hospital with
use_custom_report_header=True supplies its own name/address/logo for the
report letterhead instead of the master SystemSetting, across all three
report types (surgical, gyne cytology, non-gyne cytology)."""

from app.crud.organization import resolve_lab_header, resolve_lab_short_name
from app.crud.surgical_report_builder import prepare_report_data
from app.crud.gyne_cyto_report import prepare_gyne_report_pdf_data
from app.crud.nongyne_cyto_report import prepare_nongyne_report_pdf_data
from app.crud.surgical_report import finalize_and_snapshot_orchestrator

from tests.factories import (
    make_hospital,
    make_signable_case,
    make_bare_gyne_case,
    make_bare_nongyne_case,
    build_bulk_save_payload,
    make_system_setting,
)


class TestResolveLabHeader:
    def test_no_hospital_falls_back_to_settings(self, db):
        settings = make_system_setting(db, lab_name_en="Master Lab", lab_address="Master Address", report_logo_url="system/master.png")
        name, address, logo = resolve_lab_header(None, settings)
        assert (name, address, logo) == ("Master Lab", "Master Address", "system/master.png")

    def test_hospital_without_override_uses_settings(self, db):
        settings = make_system_setting(db, lab_name_en="Master Lab", lab_address="Master Address")
        hospital = make_hospital(db)
        name, address, _ = resolve_lab_header(hospital, settings)
        assert (name, address) == ("Master Lab", "Master Address")

    def test_hospital_with_override_uses_own_branding(self, db):
        settings = make_system_setting(db, lab_name_en="Master Lab", lab_address="Master Address")
        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.address = "Hospital B Address"
        hospital.logo_path = "hospitals/b.png"
        db.commit()

        name, address, logo = resolve_lab_header(hospital, settings)

        assert name == hospital.name
        assert address == "Hospital B Address"
        assert logo == "hospitals/b.png"

    def test_no_settings_no_override_defaults(self, db):
        name, address, logo = resolve_lab_header(None, None)
        assert name == "Laboratory Name"
        assert address == ""
        assert logo is None

    def test_report_name_en_takes_priority_over_hospital_name(self, db):
        settings = make_system_setting(db)
        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.report_name_en = "Khon Kaen Hospital"
        db.commit()

        name, _, _ = resolve_lab_header(hospital, settings)

        assert name == "Khon Kaen Hospital"


class TestResolveLabShortName:
    def test_no_hospital_falls_back_to_settings(self, db):
        settings = make_system_setting(db, lab_short_name_en="MASTER-LAB")
        assert resolve_lab_short_name(None, settings) == "MASTER-LAB"

    def test_hospital_without_override_uses_settings(self, db):
        settings = make_system_setting(db, lab_short_name_en="MASTER-LAB")
        hospital = make_hospital(db)
        assert resolve_lab_short_name(hospital, settings) == "MASTER-LAB"

    def test_hospital_with_override_uses_own_short_name(self, db):
        settings = make_system_setting(db, lab_short_name_en="MASTER-LAB")
        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.report_short_name_en = "HOSP-B"
        db.commit()

        assert resolve_lab_short_name(hospital, settings) == "HOSP-B"

    def test_hospital_override_without_short_name_falls_back_to_hospital_name(self, db):
        settings = make_system_setting(db, lab_short_name_en="MASTER-LAB")
        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        db.commit()

        assert resolve_lab_short_name(hospital, settings) == hospital.name

    def test_no_settings_no_override_defaults_to_empty(self, db):
        assert resolve_lab_short_name(None, None) == ""


class TestSurgicalReportHospitalHeader:
    def test_master_branding_by_default(self, db, admin_user, two_pathologists):
        make_system_setting(db, lab_name_en="Master Lab", lab_address="Master Address")
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id
        )

        data = prepare_report_data(db, case.id)

        assert data["lab_name_en_snapshot"] == "Master Lab"
        assert data["lab_address_snapshot"] == "Master Address"

    def test_hospital_override_replaces_master_branding(self, db, admin_user, two_pathologists):
        make_system_setting(db, lab_name_en="Master Lab", lab_address="Master Address")
        registrar, _ = admin_user
        path1, _ = two_pathologists
        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.address = "Hospital B Address"
        db.commit()
        case, specimen = make_signable_case(db, registrar_id=registrar.id, hospital=hospital)
        finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id
        )

        data = prepare_report_data(db, case.id)

        assert data["lab_name_en_snapshot"] == hospital.name
        assert data["lab_address_snapshot"] == "Hospital B Address"


class TestGyneReportHospitalHeader:
    def test_master_branding_by_default(self, db, admin_user):
        make_system_setting(db, lab_name_en="Master Lab", lab_address="Master Address")
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        data = prepare_gyne_report_pdf_data(db, case.id)

        assert data["lab_name_en_snapshot"] == "Master Lab"
        assert data["lab_address_snapshot"] == "Master Address"

    def test_hospital_override_replaces_master_branding(self, db, admin_user):
        make_system_setting(db, lab_name_en="Master Lab", lab_address="Master Address")
        registrar, _ = admin_user
        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.address = "Hospital B Address"
        db.commit()
        case = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hospital)

        data = prepare_gyne_report_pdf_data(db, case.id)

        assert data["lab_name_en_snapshot"] == hospital.name
        assert data["lab_address_snapshot"] == "Hospital B Address"


class TestNongyneReportHospitalHeader:
    def test_master_branding_by_default(self, db, admin_user):
        make_system_setting(db, lab_name_en="Master Lab", lab_address="Master Address")
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        data = prepare_nongyne_report_pdf_data(db, case.id)

        assert data["lab_name_en_snapshot"] == "Master Lab"
        assert data["lab_address_snapshot"] == "Master Address"

    def test_hospital_override_replaces_master_branding(self, db, admin_user):
        make_system_setting(db, lab_name_en="Master Lab", lab_address="Master Address")
        registrar, _ = admin_user
        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.address = "Hospital B Address"
        db.commit()
        case = make_bare_nongyne_case(db, registrar_id=registrar.id, hospital=hospital)

        data = prepare_nongyne_report_pdf_data(db, case.id)

        assert data["lab_name_en_snapshot"] == hospital.name
        assert data["lab_address_snapshot"] == "Hospital B Address"
