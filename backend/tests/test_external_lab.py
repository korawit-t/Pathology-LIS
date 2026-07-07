"""Tests for app/crud/external_lab.py — thin CRUD. Only get_external_labs'
active_only filter has any branching worth covering."""

import uuid

from app.crud.external_lab import (
    get_external_lab,
    get_external_labs,
    create_external_lab,
    update_external_lab,
    delete_external_lab,
)
from app.schemas.external_lab import ExternalLabCreate, ExternalLabUpdate


def _name(label: str) -> str:
    # `name` is globally unique, and crud commits are real/persist across
    # tests in this run — every lab needs a distinct name.
    return f"{label} {uuid.uuid4().hex[:8]}"


class TestGetExternalLabs:
    def test_active_only_filters_out_inactive_labs(self, db):
        active_name = _name("Active Lab")
        inactive_name = _name("Inactive Lab")
        create_external_lab(db, ExternalLabCreate(name=active_name, is_active=True))
        create_external_lab(db, ExternalLabCreate(name=inactive_name, is_active=False))

        all_labs = get_external_labs(db, active_only=False)
        active_labs = get_external_labs(db, active_only=True)

        names = {lab.name for lab in all_labs}
        assert {active_name, inactive_name} <= names
        assert inactive_name not in {lab.name for lab in active_labs}
        assert active_name in {lab.name for lab in active_labs}


class TestUpdateExternalLab:
    def test_updates_only_provided_fields(self, db):
        name = _name("RefLab")
        lab = create_external_lab(db, ExternalLabCreate(name=name, description="Original"))

        result = update_external_lab(db, lab.id, ExternalLabUpdate(description="Updated"))

        assert result.name == name
        assert result.description == "Updated"

    def test_missing_id_returns_none(self, db):
        assert update_external_lab(db, 999999, ExternalLabUpdate(name="x")) is None


class TestDeleteExternalLab:
    def test_deletes_existing_and_returns_true(self, db):
        lab = create_external_lab(db, ExternalLabCreate(name=_name("RefLab")))

        assert delete_external_lab(db, lab.id) is True
        assert get_external_lab(db, lab.id) is None

    def test_missing_id_returns_false(self, db):
        assert delete_external_lab(db, 999999) is False
