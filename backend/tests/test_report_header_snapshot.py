"""A signed-out report re-renders with the letterhead it was issued with — the
logo, lab name, address and footer are frozen on the report row at sign-out
instead of being re-read from settings on every view, print and HIS export,
across all three report types (surgical, gyne cytology, non-gyne cytology).

Logo files are UUID-named and never overwritten, so the frozen value is just
the relative path (report_logo_path_snapshot; "" = issued with no logo).
Reports signed before that column existed have it NULL and keep following
current settings. Live previews always use current settings."""

import base64

import pytest

import app.crud.gyne_cyto_report as gyne_report_module
import app.crud.nongyne_cyto_report as nongyne_report_module
import app.crud.surgical_report as surgical_report_module
from app.crud.gyne_cyto_report import prepare_gyne_report_pdf_data
from app.crud.nongyne_cyto_report import (
    get_nongyne_snapshot_pdf_data,
    prepare_nongyne_report_pdf_data,
)
from app.crud.surgical_report import (
    finalize_and_snapshot_orchestrator,
    get_surgical_report_pdf,
    resolve_report_logo,
)
from app.crud.surgical_report_builder import prepare_report_data
from app.models.system_setting import SystemSetting
from app.services import pdf_service

from tests.factories import (
    build_bulk_save_payload,
    make_hospital,
    make_pending_gyne_report,
    make_pending_nongyne_report,
    make_signable_case,
    make_system_setting,
)

OLD_LOGO = "system/logo_report_old.png"
NEW_LOGO = "system/logo_report_new.png"
HOSPITAL_LOGO = "hospitals/logo_hospital_b.png"

OLD_HEADER = dict(
    lab_name_th="Old Lab TH",
    lab_name_en="Old Lab",
    lab_address="Old Address",
    report_logo_url=OLD_LOGO,
    surgical_report_footer="Old surgical footer",
    gyne_report_footer="Old gyne footer",
    nongyne_report_footer="Old nongyne footer",
)
NEW_HEADER = dict(
    lab_name_th="New Lab TH",
    lab_name_en="New Lab",
    lab_address="New Address",
    report_logo_url=NEW_LOGO,
    surgical_report_footer="New surgical footer",
    gyne_report_footer="New gyne footer",
    nongyne_report_footer="New nongyne footer",
)


@pytest.fixture
def logo_store(tmp_path, monkeypatch):
    """Points every report renderer's uploads root at tmp_path, with distinct
    bytes per logo file so the embedded image shows which one was used."""
    for rel in (OLD_LOGO, NEW_LOGO, HOSPITAL_LOGO):
        f = tmp_path / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(rel.encode())
    for module in (surgical_report_module, gyne_report_module, nongyne_report_module):
        monkeypatch.setattr(module, "STORAGE_BASE", tmp_path)
    return tmp_path


@pytest.fixture
def rendered_context(monkeypatch):
    """The template context get_surgical_report_pdf hands to WeasyPrint."""
    captured = {}

    def fake_generate_pdf_blob(report_data, template_name=None, is_preview=False):
        captured.update(report_data)
        return b""

    monkeypatch.setattr(pdf_service, "generate_pdf_blob", fake_generate_pdf_blob)
    monkeypatch.setattr(pdf_service, "prepend_consult_cover", lambda pdf, data: pdf)
    return captured


def _data_uri(rel):
    """Gyne/non-gyne embed the logo as base64 rather than a file:// URI."""
    return f"data:image/png;base64,{base64.b64encode(rel.encode()).decode()}"


def _change_settings(db, **values):
    settings = db.query(SystemSetting).first()
    for key, value in values.items():
        setattr(settings, key, value)
    db.commit()


def _custom_header_hospital(db):
    hospital = make_hospital(db)
    hospital.use_custom_report_header = True
    hospital.address = "Hospital B Address"
    hospital.logo_path = HOSPITAL_LOGO
    db.commit()
    return hospital


def _rebrand_hospital(db, hospital):
    hospital.address = "Hospital B New Address"
    hospital.logo_path = NEW_LOGO
    db.commit()


class TestSurgicalHeaderSnapshot:
    def _sign_out(self, db, admin_user, two_pathologists, hospital=None):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        case, specimen = make_signable_case(db, registrar_id=registrar.id, hospital=hospital)
        return finalize_and_snapshot_orchestrator(
            db, case.id, build_bulk_save_payload(case.id, specimen.id, path1.id), path1.id
        )

    def test_signed_report_keeps_issued_logo_and_header(
        self, db, admin_user, two_pathologists, logo_store, rendered_context
    ):
        make_system_setting(db, **OLD_HEADER)
        report = self._sign_out(db, admin_user, two_pathologists)
        _change_settings(db, **NEW_HEADER)

        get_surgical_report_pdf(db, report)

        assert rendered_context["report_logo_path_snapshot"] == OLD_LOGO
        assert rendered_context["report_logo_url_snapshot"] == (logo_store / OLD_LOGO).as_uri()
        assert rendered_context["lab_name_en_snapshot"] == "Old Lab"
        assert rendered_context["lab_address_snapshot"] == "Old Address"
        assert rendered_context["report_footer_snapshot"] == "Old surgical footer"

    def test_report_issued_without_logo_stays_without_one(
        self, db, admin_user, two_pathologists, logo_store, rendered_context
    ):
        make_system_setting(db, **{**OLD_HEADER, "report_logo_url": None})
        report = self._sign_out(db, admin_user, two_pathologists)
        _change_settings(db, **NEW_HEADER)

        get_surgical_report_pdf(db, report)

        assert report.report_logo_path_snapshot == ""
        assert rendered_context["report_logo_url_snapshot"] is None

    def test_report_signed_before_snapshot_follows_current_logo(
        self, db, admin_user, two_pathologists, logo_store, rendered_context
    ):
        make_system_setting(db, **OLD_HEADER)
        report = self._sign_out(db, admin_user, two_pathologists)
        report.report_logo_path_snapshot = None  # every row signed before this column existed
        db.commit()
        _change_settings(db, **NEW_HEADER)

        get_surgical_report_pdf(db, report)

        assert rendered_context["report_logo_url_snapshot"] == (logo_store / NEW_LOGO).as_uri()

    def test_custom_header_hospital_logo_is_what_gets_frozen(
        self, db, admin_user, two_pathologists, logo_store, rendered_context
    ):
        make_system_setting(db, **OLD_HEADER)
        hospital = _custom_header_hospital(db)
        report = self._sign_out(db, admin_user, two_pathologists, hospital=hospital)
        assert report.report_logo_path_snapshot == HOSPITAL_LOGO
        _rebrand_hospital(db, hospital)

        get_surgical_report_pdf(db, report)

        assert rendered_context["report_logo_url_snapshot"] == (logo_store / HOSPITAL_LOGO).as_uri()
        assert rendered_context["lab_address_snapshot"] == "Hospital B Address"

    def test_preview_uses_current_settings(self, db, admin_user, two_pathologists, logo_store):
        make_system_setting(db, **OLD_HEADER)
        report = self._sign_out(db, admin_user, two_pathologists)
        _change_settings(db, **NEW_HEADER)

        # Same two calls the /preview router makes.
        data = prepare_report_data(db, report.case_id)
        resolve_report_logo(data, db)

        assert data["report_logo_url_snapshot"] == (logo_store / NEW_LOGO).as_uri()
        assert data["lab_name_en_snapshot"] == "New Lab"
        assert data["lab_address_snapshot"] == "New Address"


class TestGyneHeaderSnapshot:
    def _sign_out(self, db, admin_user, two_pathologists, hospital=None):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        return make_pending_gyne_report(db, registrar.id, path1.id, hospital=hospital)

    def test_signed_report_keeps_issued_logo_and_header(self, db, admin_user, two_pathologists, logo_store):
        make_system_setting(db, **OLD_HEADER)
        case, report = self._sign_out(db, admin_user, two_pathologists)
        _change_settings(db, **NEW_HEADER)

        data = prepare_gyne_report_pdf_data(db, case.id, report_id=report.id)

        assert data["report_logo_path_snapshot"] == OLD_LOGO
        assert data["report_logo_url_snapshot"] == _data_uri(OLD_LOGO)
        assert data["lab_name_en_snapshot"] == "Old Lab"
        assert data["lab_address_snapshot"] == "Old Address"
        assert data["report_footer_snapshot"] == "Old gyne footer"

    def test_report_issued_without_logo_stays_without_one(self, db, admin_user, two_pathologists, logo_store):
        make_system_setting(db, **{**OLD_HEADER, "report_logo_url": None})
        case, report = self._sign_out(db, admin_user, two_pathologists)
        _change_settings(db, **NEW_HEADER)

        data = prepare_gyne_report_pdf_data(db, case.id, report_id=report.id)

        assert report.report_logo_path_snapshot == ""
        assert data["report_logo_url_snapshot"] is None

    def test_report_signed_before_snapshot_follows_current_settings(
        self, db, admin_user, two_pathologists, logo_store
    ):
        make_system_setting(db, **OLD_HEADER)
        case, report = self._sign_out(db, admin_user, two_pathologists)
        # What a row signed before this change looks like: master address stored,
        # no English name, footer or logo path.
        report.report_logo_path_snapshot = None
        report.lab_name_en_snapshot = None
        report.report_footer_snapshot = None
        db.commit()
        _change_settings(db, **NEW_HEADER)

        data = prepare_gyne_report_pdf_data(db, case.id, report_id=report.id)

        assert data["report_logo_url_snapshot"] == _data_uri(NEW_LOGO)
        assert data["lab_name_en_snapshot"] == "New Lab"
        assert data["lab_address_snapshot"] == "New Address"
        assert data["report_footer_snapshot"] == "New gyne footer"

    def test_custom_header_hospital_is_what_gets_frozen(self, db, admin_user, two_pathologists, logo_store):
        make_system_setting(db, **OLD_HEADER)
        hospital = _custom_header_hospital(db)
        case, report = self._sign_out(db, admin_user, two_pathologists, hospital=hospital)
        assert report.lab_name_en_snapshot == hospital.name
        assert report.lab_address_snapshot == "Hospital B Address"
        assert report.report_logo_path_snapshot == HOSPITAL_LOGO
        _rebrand_hospital(db, hospital)

        data = prepare_gyne_report_pdf_data(db, case.id, report_id=report.id)

        assert data["lab_address_snapshot"] == "Hospital B Address"
        assert data["report_logo_url_snapshot"] == _data_uri(HOSPITAL_LOGO)

    def test_preview_uses_current_settings(self, db, admin_user, two_pathologists, logo_store):
        make_system_setting(db, **OLD_HEADER)
        case, _report = self._sign_out(db, admin_user, two_pathologists)
        _change_settings(db, **NEW_HEADER)

        data = prepare_gyne_report_pdf_data(db, case.id, is_preview=True)

        assert data["report_logo_url_snapshot"] == _data_uri(NEW_LOGO)
        assert data["lab_name_en_snapshot"] == "New Lab"
        assert data["lab_address_snapshot"] == "New Address"
        assert data["report_footer_snapshot"] == "New gyne footer"


class TestNongyneHeaderSnapshot:
    def _sign_out(self, db, admin_user, two_pathologists, hospital=None):
        registrar, _ = admin_user
        path1, _ = two_pathologists
        return make_pending_nongyne_report(db, registrar.id, path1.id, hospital=hospital)

    def test_signed_report_keeps_issued_logo_and_header(self, db, admin_user, two_pathologists, logo_store):
        make_system_setting(db, **OLD_HEADER)
        _case, report = self._sign_out(db, admin_user, two_pathologists)
        _change_settings(db, **NEW_HEADER)

        data = get_nongyne_snapshot_pdf_data(db, report)

        assert data["report_logo_path_snapshot"] == OLD_LOGO
        assert data["report_logo_url_snapshot"] == _data_uri(OLD_LOGO)
        assert data["lab_name_snapshot"] == "Old Lab TH"
        assert data["lab_name_en_snapshot"] == "Old Lab"
        assert data["lab_address_snapshot"] == "Old Address"
        assert data["report_footer_snapshot"] == "Old nongyne footer"

    def test_report_issued_without_logo_stays_without_one(self, db, admin_user, two_pathologists, logo_store):
        make_system_setting(db, **{**OLD_HEADER, "report_logo_url": None})
        _case, report = self._sign_out(db, admin_user, two_pathologists)
        _change_settings(db, **NEW_HEADER)

        data = get_nongyne_snapshot_pdf_data(db, report)

        assert report.report_logo_path_snapshot == ""
        assert data["report_logo_url_snapshot"] is None

    def test_report_signed_before_snapshot_follows_current_settings(
        self, db, admin_user, two_pathologists, logo_store
    ):
        make_system_setting(db, **OLD_HEADER)
        _case, report = self._sign_out(db, admin_user, two_pathologists)
        # What a row signed before this change looks like: master address stored,
        # no English name, footer or logo path.
        report.report_logo_path_snapshot = None
        report.lab_name_en_snapshot = None
        report.report_footer_snapshot = None
        db.commit()
        _change_settings(db, **NEW_HEADER)

        data = get_nongyne_snapshot_pdf_data(db, report)

        assert data["report_logo_url_snapshot"] == _data_uri(NEW_LOGO)
        assert data["lab_name_snapshot"] == "New Lab TH"
        assert data["lab_name_en_snapshot"] == "New Lab"
        assert data["lab_address_snapshot"] == "New Address"
        assert data["report_footer_snapshot"] == "New nongyne footer"

    def test_custom_header_hospital_is_what_gets_frozen(self, db, admin_user, two_pathologists, logo_store):
        make_system_setting(db, **OLD_HEADER)
        hospital = _custom_header_hospital(db)
        _case, report = self._sign_out(db, admin_user, two_pathologists, hospital=hospital)
        assert report.lab_name_en_snapshot == hospital.name
        assert report.lab_address_snapshot == "Hospital B Address"
        assert report.report_logo_path_snapshot == HOSPITAL_LOGO
        _rebrand_hospital(db, hospital)

        data = get_nongyne_snapshot_pdf_data(db, report)

        assert data["lab_address_snapshot"] == "Hospital B Address"
        assert data["report_logo_url_snapshot"] == _data_uri(HOSPITAL_LOGO)

    def test_preview_uses_current_settings(self, db, admin_user, two_pathologists, logo_store):
        make_system_setting(db, **OLD_HEADER)
        case, _report = self._sign_out(db, admin_user, two_pathologists)
        _change_settings(db, **NEW_HEADER)

        data = prepare_nongyne_report_pdf_data(db, case.id)

        assert data["report_logo_url_snapshot"] == _data_uri(NEW_LOGO)
        assert data["lab_name_en_snapshot"] == "New Lab"
        assert data["lab_address_snapshot"] == "New Address"
        assert data["report_footer_snapshot"] == "New nongyne footer"
