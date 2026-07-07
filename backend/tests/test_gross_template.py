"""Tests for app/crud/gross_template.py. Two things worth locking in:
get_templates unconditionally filters to is_active=True (there's no way to
list inactive ones through this function), and delete is a soft-delete
(flips is_active, never removes the row) — so the two behaviors compose:
a "deleted" template disappears from get_templates but still exists in the
table."""

from app.crud.gross_template import get_template, get_templates, create_template, update_template, delete_template
from app.schemas.gross_template import GrossTemplateCreate, GrossTemplateUpdate
from app.models.gross_template import GrossTemplate


class TestGetTemplates:
    def test_only_returns_active_templates(self, db, admin_user):
        registrar, _ = admin_user
        create_template(db, GrossTemplateCreate(name="Active", raw_content="x", is_active=True), user_id=registrar.id)
        create_template(db, GrossTemplateCreate(name="Inactive", raw_content="x", is_active=False), user_id=registrar.id)

        result = get_templates(db)

        assert {t.name for t in result} == {"Active"}

    def test_filters_by_category(self, db, admin_user):
        registrar, _ = admin_user
        create_template(db, GrossTemplateCreate(name="Skin", raw_content="x", category="Skin"), user_id=registrar.id)
        create_template(db, GrossTemplateCreate(name="GI", raw_content="x", category="GI"), user_id=registrar.id)

        result = get_templates(db, category="Skin")

        assert {t.name for t in result} == {"Skin"}


class TestDeleteTemplate:
    def test_soft_deletes_rather_than_removing_the_row(self, db, admin_user):
        registrar, _ = admin_user
        template = create_template(db, GrossTemplateCreate(name="Temp", raw_content="x"), user_id=registrar.id)

        delete_template(db, template.id)

        assert db.query(GrossTemplate).filter(GrossTemplate.id == template.id).first() is not None
        assert get_template(db, template.id).is_active is False

    def test_soft_deleted_template_disappears_from_get_templates(self, db, admin_user):
        registrar, _ = admin_user
        template = create_template(db, GrossTemplateCreate(name="Temp", raw_content="x"), user_id=registrar.id)

        delete_template(db, template.id)

        assert template.id not in {t.id for t in get_templates(db)}


class TestUpdateTemplate:
    def test_updates_only_provided_fields(self, db, admin_user):
        registrar, _ = admin_user
        template = create_template(
            db, GrossTemplateCreate(name="Original", raw_content="old"), user_id=registrar.id,
        )

        result = update_template(db, template.id, GrossTemplateUpdate(raw_content="new"))

        assert result.raw_content == "new"
        assert result.name == "Original"

    def test_missing_id_returns_none(self, db):
        assert update_template(db, 999999, GrossTemplateUpdate(name="x")) is None
