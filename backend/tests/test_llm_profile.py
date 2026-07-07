"""Tests for app/crud/llm_profile.py — thin CRUD, kept lean."""

from app.crud.llm_profile import get_all, get_by_id, create, update, delete
from app.schemas.llm_profile import LlmProfileCreate, LlmProfileUpdate


class TestGetAll:
    def test_orders_by_id(self, db):
        second = create(db, LlmProfileCreate(display_name="Second", model="gpt-4o"))
        first_created_but_should_sort_after = create(db, LlmProfileCreate(display_name="Third", model="gpt-4o"))

        result = get_all(db)

        ids = [p.id for p in result]
        assert ids == sorted(ids)


class TestUpdate:
    def test_updates_only_provided_fields(self, db):
        profile = create(db, LlmProfileCreate(display_name="Original", model="gpt-4o", is_active=True))

        result = update(db, profile, LlmProfileUpdate(is_active=False))

        assert result.display_name == "Original"
        assert result.is_active is False


class TestDelete:
    def test_removes_the_profile(self, db):
        profile = create(db, LlmProfileCreate(display_name="Temp", model="gpt-4o"))

        delete(db, profile)

        assert get_by_id(db, profile.id) is None
