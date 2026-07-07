"""Tests for app/crud/diagnostic_template.py — thin CRUD. Worth covering:
the category filter, and update's bulk `Query.update()` + refresh pattern
(a different code shape than the usual setattr-loop, so worth confirming it
actually reflects on the refreshed instance)."""

from app.crud.diagnostic_template import (
    get_diagnostic_template,
    get_diagnostic_templates,
    create_diagnostic_template,
    update_diagnostic_template,
    delete_diagnostic_template,
)
from app.schemas.diagnostic_template import DiagnosticTemplateCreate, DiagnosticTemplateUpdate


class TestGetDiagnosticTemplates:
    def test_filters_by_category(self, db):
        create_diagnostic_template(db, DiagnosticTemplateCreate(name="A", diagnosis_content="x", category="Skin"))
        create_diagnostic_template(db, DiagnosticTemplateCreate(name="B", diagnosis_content="x", category="GI"))

        skin_only = get_diagnostic_templates(db, category="Skin")

        assert {t.name for t in skin_only} == {"A"}


class TestUpdateDiagnosticTemplate:
    def test_bulk_update_is_reflected_on_the_refreshed_instance(self, db):
        template = create_diagnostic_template(
            db, DiagnosticTemplateCreate(name="Original", diagnosis_content="old text"),
        )

        result = update_diagnostic_template(
            db, template.id, DiagnosticTemplateUpdate(diagnosis_content="new text"),
        )

        assert result.diagnosis_content == "new text"
        assert result.name == "Original"  # untouched
        # Confirm it's really committed, not just mutated in-memory
        assert get_diagnostic_template(db, template.id).diagnosis_content == "new text"

    def test_missing_id_returns_none(self, db):
        assert update_diagnostic_template(db, 999999, DiagnosticTemplateUpdate(name="x")) is None


class TestDeleteDiagnosticTemplate:
    def test_deletes_existing(self, db):
        template = create_diagnostic_template(db, DiagnosticTemplateCreate(name="Temp", diagnosis_content="x"))

        delete_diagnostic_template(db, template.id)

        assert get_diagnostic_template(db, template.id) is None

    def test_missing_id_is_a_no_op(self, db):
        assert delete_diagnostic_template(db, 999999) is None
