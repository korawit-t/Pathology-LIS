"""Tests for app/crud/system_setting.py + app/routers/system_setting.py —
the singleton-per-hospital-slug settings row (auto-created on first read),
role-gated update/logo-upload/report-template-set/delete endpoints, and the
report-template list/preview/set trio.

Security regression coverage: preview_report_template validates its
template_name is contained within TEMPLATES_DIR via
`.resolve().is_relative_to(...)` before touching the filesystem;
set_report_template's sibling endpoint currently only checks `.exists()` —
no containment check — so a traversal path that happens to resolve to any
real file elsewhere on disk is silently accepted and persisted as the
"active" template reference. See SECURITY_FINDINGS.md. This is pinned as a
documented current-behavior regression test, not fixed here."""

import io

import pytest

from app.crud.system_setting import get_all_settings, get_settings, update_settings, delete_settings
from app.schemas.system_setting import SystemSettingUpdate
from app.models.system_setting import SystemSetting

from tests.factories import make_system_setting, clear_system_settings


class TestGetAllSettings:
    def test_returns_all_rows_ordered_by_id(self, db):
        clear_system_settings(db)
        make_system_setting(db, hospital_slug="master")
        db.add(SystemSetting(hospital_slug="branch-a"))
        db.commit()

        result = get_all_settings(db)

        assert [s.hospital_slug for s in result] == ["master", "branch-a"]


class TestGetSettings:
    def test_creates_default_row_when_none_exists(self, db):
        clear_system_settings(db)

        settings = get_settings(db, hospital_slug="master")

        assert settings.hospital_slug == "master"
        assert db.query(SystemSetting).filter(SystemSetting.hospital_slug == "master").count() == 1

    def test_returns_existing_row_without_duplicating(self, db):
        existing = make_system_setting(db, hospital_slug="master", lab_name_th="Existing Lab")

        settings = get_settings(db, hospital_slug="master")

        assert settings.id == existing.id
        assert settings.lab_name_th == "Existing Lab"


class TestUpdateSettings:
    def test_updates_only_provided_fields(self, db):
        make_system_setting(db, hospital_slug="master", lab_name_th="Original", lab_name_en="Original EN")

        updated = update_settings(db, SystemSettingUpdate(lab_name_th="Updated"), hospital_slug="master")

        assert updated.lab_name_th == "Updated"
        assert updated.lab_name_en == "Original EN"  # untouched

    def test_creates_row_if_missing_fail_safe(self, db):
        clear_system_settings(db)

        updated = update_settings(db, SystemSettingUpdate(lab_name_th="Brand New"), hospital_slug="master")

        assert updated.lab_name_th == "Brand New"

    def test_ignores_hospital_slug_field_in_payload(self, db):
        make_system_setting(db, hospital_slug="master")

        updated = update_settings(db, SystemSettingUpdate(hospital_slug="hijacked"), hospital_slug="master")

        assert updated.hospital_slug == "master"  # lookup key itself can't be changed via payload


class TestDeleteSettings:
    def test_refuses_to_delete_master(self, db):
        master = make_system_setting(db, hospital_slug="master")

        with pytest.raises(ValueError):
            delete_settings(db, setting_id=master.id)
        assert db.query(SystemSetting).filter(SystemSetting.id == master.id).first() is not None

    def test_deletes_non_master_row(self, db):
        db.add(SystemSetting(hospital_slug="branch-a"))
        db.commit()
        branch = db.query(SystemSetting).filter(SystemSetting.hospital_slug == "branch-a").first()

        assert delete_settings(db, setting_id=branch.id) is True
        assert db.query(SystemSetting).filter(SystemSetting.id == branch.id).first() is None

    def test_missing_id_returns_false(self, db):
        assert delete_settings(db, setting_id=999999) is False


class TestUpdateSettingsRouter:
    def test_requires_admin(self, clinician_client):
        r = clinician_client.patch("/system-settings/update", json={"lab_name_th": "x"})
        assert r.status_code == 403

    def test_admin_can_update(self, admin_client, db):
        clear_system_settings(db)
        r = admin_client.patch("/system-settings/update", json={"lab_name_th": "Updated via API"})
        assert r.status_code == 200
        assert r.json()["lab_name_th"] == "Updated via API"


class TestUploadLogoRouter:
    def _valid_png_bytes(self) -> bytes:
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (2, 2), color=(255, 0, 0)).save(buf, format="PNG")
        return buf.getvalue()

    def test_requires_admin(self, clinician_client):
        r = clinician_client.post(
            "/system-settings/upload-logo",
            params={"logo_type": "report"},
            files={"file": ("logo.png", self._valid_png_bytes(), "image/png")},
        )
        assert r.status_code == 403

    def test_rejects_invalid_logo_type(self, admin_client):
        r = admin_client.post(
            "/system-settings/upload-logo",
            params={"logo_type": "banner"},
            files={"file": ("logo.png", self._valid_png_bytes(), "image/png")},
        )
        assert r.status_code == 400

    def test_valid_upload_sets_logo_url(self, admin_client, db):
        clear_system_settings(db)
        r = admin_client.post(
            "/system-settings/upload-logo",
            params={"logo_type": "report"},
            files={"file": ("logo.png", self._valid_png_bytes(), "image/png")},
        )
        assert r.status_code == 200
        assert r.json()["report_logo_url"].startswith("system/logo_report_")


class TestListReportTemplatesRouter:
    def test_requires_login(self, client):
        r = client.get("/system-settings/report-templates")
        assert r.status_code == 401

    def test_returns_available_and_active_per_type(self, admin_client, db):
        clear_system_settings(db)
        r = admin_client.get("/system-settings/report-templates")
        assert r.status_code == 200
        body = r.json()
        assert set(body.keys()) == {"surgical", "gyne", "nongyne"}
        assert "surgical_report_template.html" in body["surgical"]["available"]
        assert body["surgical"]["active"] == "surgical_report_template.html"  # default fallback


class TestPreviewReportTemplateRouter:
    def test_rejects_invalid_report_type(self, admin_client):
        r = admin_client.get(
            "/system-settings/report-templates/preview",
            params={"report_type": "bogus", "template_name": "surgical_report_template.html"},
        )
        assert r.status_code == 400

    def test_rejects_path_traversal(self, admin_client):
        r = admin_client.get(
            "/system-settings/report-templates/preview",
            params={"report_type": "surgical", "template_name": "../../../main.py"},
        )
        assert r.status_code == 400

    def test_rejects_template_belonging_to_a_different_report_type(self, admin_client):
        r = admin_client.get(
            "/system-settings/report-templates/preview",
            params={"report_type": "surgical", "template_name": "gyne_cyto_report_template.html"},
        )
        assert r.status_code == 404

    def test_valid_template_renders_pdf(self, admin_client, db):
        clear_system_settings(db)
        r = admin_client.get(
            "/system-settings/report-templates/preview",
            params={"report_type": "surgical", "template_name": "surgical_report_template.html"},
        )
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"


class TestSetReportTemplateRouter:
    def test_requires_admin(self, clinician_client):
        r = clinician_client.patch(
            "/system-settings/report-templates",
            json={"report_type": "surgical", "template_name": "surgical_report_template.html"},
        )
        assert r.status_code == 403

    def test_rejects_invalid_report_type(self, admin_client):
        r = admin_client.patch(
            "/system-settings/report-templates",
            json={"report_type": "bogus", "template_name": "surgical_report_template.html"},
        )
        assert r.status_code == 400

    def test_rejects_nonexistent_template(self, admin_client):
        r = admin_client.patch(
            "/system-settings/report-templates",
            json={"report_type": "surgical", "template_name": "does_not_exist.html"},
        )
        assert r.status_code == 404

    def test_valid_template_is_persisted(self, admin_client, db):
        clear_system_settings(db)
        r = admin_client.patch(
            "/system-settings/report-templates",
            json={"report_type": "surgical", "template_name": "surgical_report_template.html"},
        )
        assert r.status_code == 200
        assert r.json()["surgical_report_template"] == "surgical_report_template.html"

    def test_rejects_path_traversal_like_its_preview_sibling(self, admin_client, db):
        """Regression test: this endpoint now resolves and checks containment
        within TEMPLATES_DIR, matching preview_report_template. A `../`
        sequence that resolves to a real file elsewhere on disk (here,
        backend/main.py, 3 levels above app/templates/reports/) must be
        rejected rather than persisted as the "active" template reference."""
        clear_system_settings(db)

        r = admin_client.patch(
            "/system-settings/report-templates",
            json={"report_type": "surgical", "template_name": "../../../main.py"},
        )

        assert r.status_code == 400


class TestDeleteSettingsRouter:
    def test_requires_admin(self, clinician_client, db):
        db.add(SystemSetting(hospital_slug="branch-b"))
        db.commit()
        branch = db.query(SystemSetting).filter(SystemSetting.hospital_slug == "branch-b").first()

        r = clinician_client.delete(f"/system-settings/{branch.id}")
        assert r.status_code == 403

    def test_admin_cannot_delete_master(self, admin_client, db):
        master = make_system_setting(db, hospital_slug="master")

        r = admin_client.delete(f"/system-settings/{master.id}")

        assert r.status_code == 400

    def test_admin_can_delete_non_master(self, admin_client, db):
        db.add(SystemSetting(hospital_slug="branch-c"))
        db.commit()
        branch = db.query(SystemSetting).filter(SystemSetting.hospital_slug == "branch-c").first()

        r = admin_client.delete(f"/system-settings/{branch.id}")

        assert r.status_code == 200
        assert db.query(SystemSetting).filter(SystemSetting.id == branch.id).first() is None
