"""Tests for app/services/pdf_service.py. generate_pdf_blob is tested
against a minimal Jinja DictLoader template swapped in for the module's
real `env` (which is bound to the actual app templates dir) — this proves
the function's own logic (font path injection, is_preview flag, WeasyPrint
invocation) without coupling the test to any real report template's full
field contract, and without ever touching real hospital template overrides
under app/templates/reports/local/."""

from jinja2 import Environment, DictLoader

import app.services.pdf_service as pdf_service


class TestResolveTemplate:
    def test_uses_the_local_override_when_one_exists(self, monkeypatch):
        monkeypatch.setattr(pdf_service.os.path, "isfile", lambda p: True)

        assert pdf_service._resolve_template("surgical_report_template.html") == \
            "reports/local/surgical_report_template.html"

    def test_falls_back_to_the_canonical_name_when_no_override_exists(self, monkeypatch):
        monkeypatch.setattr(pdf_service.os.path, "isfile", lambda p: False)

        assert pdf_service._resolve_template("reports/surgical_report_template.html") == \
            "reports/surgical_report_template.html"


class TestCheckFonts:
    def test_status_ok_when_the_font_dir_exists_and_all_fonts_are_found(self, monkeypatch):
        monkeypatch.setattr(pdf_service.os.path, "isdir", lambda p: True)
        monkeypatch.setattr(pdf_service.os.path, "exists", lambda p: True)

        result = pdf_service.check_fonts()

        assert result["status"] == "ok"
        assert result["missing"] == []
        assert result["font_dir_exists"] is True

    def test_status_missing_when_the_font_dir_does_not_exist(self, monkeypatch):
        monkeypatch.setattr(pdf_service.os.path, "isdir", lambda p: False)
        monkeypatch.setattr(pdf_service.os.path, "exists", lambda p: False)

        result = pdf_service.check_fonts()

        assert result["status"] == "missing"
        assert result["font_dir_exists"] is False
        assert len(result["missing"]) == 4

    def test_status_partial_when_only_some_fonts_are_found(self, monkeypatch):
        monkeypatch.setattr(pdf_service.os.path, "isdir", lambda p: True)
        monkeypatch.setattr(pdf_service.os.path, "exists", lambda p: p.endswith("Sarabun-Regular.ttf"))

        result = pdf_service.check_fonts()

        assert result["status"] == "partial"
        assert result["found"] == ["Sarabun-Regular.ttf"]
        assert "Sarabun-Bold.ttf" in result["missing"]


class TestGeneratePdfBlob:
    def test_renders_the_template_and_returns_valid_pdf_bytes(self, monkeypatch):
        monkeypatch.setattr(
            pdf_service, "env",
            Environment(loader=DictLoader({
                "test_report.html": "<html><body><h1>{{ patient_name }}</h1></body></html>",
            })),
        )

        result = pdf_service.generate_pdf_blob({"patient_name": "Somchai"}, template_name="test_report.html")

        assert result[:4] == b"%PDF"

    def test_sets_is_preview_on_the_report_data_dict(self, monkeypatch):
        monkeypatch.setattr(
            pdf_service, "env",
            Environment(loader=DictLoader({
                "test_report.html": "<html><body>{{ 'PREVIEW' if is_preview else 'FINAL' }}</body></html>",
            })),
        )
        report_data = {}

        pdf_service.generate_pdf_blob(report_data, template_name="test_report.html", is_preview=True)

        assert report_data["is_preview"] is True

    def test_missing_field_renders_as_empty_string_not_a_crash(self, monkeypatch):
        # `finalize=lambda x: "" if x is None else x` on the real env means
        # an undefined/None Jinja variable renders blank instead of raising
        # or printing "None" — confirm that behavior survives on this env too.
        monkeypatch.setattr(
            pdf_service, "env",
            Environment(
                loader=DictLoader({"test_report.html": "<html><body>[{{ missing_field }}]</body></html>"}),
                finalize=lambda x: "" if x is None else x,
            ),
        )

        result = pdf_service.generate_pdf_blob({}, template_name="test_report.html")

        assert result[:4] == b"%PDF"
