"""Tests for app/crud/anatomical_pathology_test.py — plain CRUD, no business logic."""

import uuid

from app.crud.anatomical_pathology_test import (
    create_test,
    get_test_by_id,
    list_tests,
    update_test,
    delete_test,
    get_all_ap_tests,
    get_test_by_system_code,
)
from app.schemas.anatomical_pathology_test import (
    AnatomicalPathologyTestCreate,
    AnatomicalPathologyTestUpdate,
)


def _create(db, **overrides):
    fields = dict(name=f"Test {uuid.uuid4().hex[:6]}", category="Cytology")
    fields.update(overrides)
    return create_test(db, AnatomicalPathologyTestCreate(**fields))


class TestCreateTest:
    def test_persists_fields(self, db):
        item = _create(db, name="PAP Smear", category="Cytology", price_tier_1=100.0)

        assert item.id is not None
        assert item.name == "PAP Smear"
        assert item.category == "Cytology"
        assert item.price_tier_1 == 100.0


class TestGetTestById:
    def test_found(self, db):
        item = _create(db)
        assert get_test_by_id(db, item.id).id == item.id

    def test_missing_returns_none(self, db):
        assert get_test_by_id(db, 999999) is None


class TestListTests:
    def test_filters_by_category(self, db):
        cytology = _create(db, category="Cytology")
        histo = _create(db, category="Histology")

        results = list_tests(db, category="Cytology")
        result_ids = [r.id for r in results]

        assert cytology.id in result_ids
        assert histo.id not in result_ids

    def test_sorted_alphabetically_by_name(self, db):
        cat = f"SortCat{uuid.uuid4().hex[:6]}"
        _create(db, name="Zebra Test", category=cat)
        _create(db, name="Alpha Test", category=cat)

        results = list_tests(db, category=cat)

        assert [r.name for r in results] == ["Alpha Test", "Zebra Test"]


class TestUpdateTest:
    def test_updates_only_provided_fields(self, db):
        item = _create(db, name="Original", price_tier_1=50.0)

        updated = update_test(db, item.id, AnatomicalPathologyTestUpdate(name="Renamed"))

        assert updated.name == "Renamed"
        assert updated.price_tier_1 == 50.0  # untouched

    def test_missing_returns_none(self, db):
        assert update_test(db, 999999, AnatomicalPathologyTestUpdate(name="X")) is None


class TestDeleteTest:
    def test_deletes_and_returns_message(self, db):
        item = _create(db)

        result = delete_test(db, item.id)

        assert result == {"message": "Deleted successfully"}
        assert get_test_by_id(db, item.id) is None

    def test_missing_raises_404(self, db):
        from fastapi import HTTPException
        import pytest

        with pytest.raises(HTTPException) as exc:
            delete_test(db, 999999)
        assert exc.value.status_code == 404


class TestGetAllApTests:
    def test_includes_created_item(self, db):
        item = _create(db)
        result_ids = [r.id for r in get_all_ap_tests(db)]
        assert item.id in result_ids


class TestGetTestBySystemCode:
    def test_found(self, db):
        code = f"CODE_{uuid.uuid4().hex[:8]}"
        item = _create(db, system_code=code)

        assert get_test_by_system_code(db, code).id == item.id

    def test_missing_returns_none(self, db):
        assert get_test_by_system_code(db, f"NO_SUCH_{uuid.uuid4().hex[:8]}") is None
