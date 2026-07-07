"""Focused test for app/routers/legacy_reports.py's _build_legacy_pdf_data —
specifically the report-logo embedding fix (was `.lstrip("/storage/")`,
which — like the file_handler.py delete bug — ate the whole leading path
segment on any word sharing letters with "/storage/", e.g. "system").
This is not a full test suite for the (otherwise still-untested) router."""

from app.routers.legacy_reports import _build_legacy_pdf_data
from app.models.legacy_surgical_report import LegacySurgicalReport
import app.routers.legacy_reports as legacy_reports_module

from tests.factories import make_system_setting


def _patch_uploads_dir(monkeypatch, tmp_path):
    real_path_cls = legacy_reports_module.Path

    def fake_path(p):
        return tmp_path if p == "uploads" else real_path_cls(p)

    monkeypatch.setattr(legacy_reports_module, "Path", fake_path)


class TestBuildLegacyPdfDataLogoSnapshot:
    def test_embeds_the_logo_when_the_file_exists_at_the_correct_path(self, db, monkeypatch, tmp_path):
        # Regression: report_logo_url is typically "/storage/system/logo.png"
        # — "system" shares every letter with "/storage/" up to the "s" that
        # starts it, so the old `.lstrip("/storage/")` ate that leading "s"
        # too, always looking in the wrong directory and silently returning
        # no logo.
        _patch_uploads_dir(monkeypatch, tmp_path)
        make_system_setting(db, report_logo_url="/storage/system/logo.png")
        logo_dir = tmp_path / "system"
        logo_dir.mkdir(parents=True)
        (logo_dir / "logo.png").write_bytes(b"\x89PNG\r\n\x1a\nfake png bytes")
        report = LegacySurgicalReport()

        data = _build_legacy_pdf_data(report, db)

        assert data["report_logo_url_snapshot"] is not None
        assert data["report_logo_url_snapshot"].startswith("data:image/png;base64,")

    def test_missing_logo_file_falls_back_to_none_without_raising(self, db, monkeypatch, tmp_path):
        _patch_uploads_dir(monkeypatch, tmp_path)
        make_system_setting(db, report_logo_url="/storage/system/does-not-exist.png")
        report = LegacySurgicalReport()

        data = _build_legacy_pdf_data(report, db)

        assert data["report_logo_url_snapshot"] is None

    def test_no_logo_configured_gives_none(self, db, monkeypatch, tmp_path):
        _patch_uploads_dir(monkeypatch, tmp_path)
        make_system_setting(db, report_logo_url=None)
        report = LegacySurgicalReport()

        data = _build_legacy_pdf_data(report, db)

        assert data["report_logo_url_snapshot"] is None
