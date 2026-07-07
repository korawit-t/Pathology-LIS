"""Tests for app/crud/tumor_registry.py — a small create-or-update (upsert)
helper. The behavior worth locking in: creating on first upsert vs updating
in place on a second one, only touching fields the caller actually set, and
never re-stamping created_by_id on an update."""

from app.schemas.tumor_registry import TumorRegistryUpsert
from app.crud.tumor_registry import get_by_case_id, upsert

from tests.factories import make_bare_case


class TestGetByCaseId:
    def test_returns_none_when_no_registry_exists(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)

        assert get_by_case_id(db, case.id) is None


class TestUpsert:
    def test_creates_a_new_record_stamped_with_the_creating_user(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case = make_bare_case(db, registrar_id=registrar.id)

        result = upsert(db, case.id, TumorRegistryUpsert(grade="G2"), user_id=path1.id)

        assert result.surgical_case_id == case.id
        assert result.grade == "G2"
        assert result.created_by_id == path1.id

    def test_second_upsert_updates_in_place_without_creating_a_duplicate(self, db, admin_user, two_pathologists):
        registrar, _ = admin_user
        path1, path2 = two_pathologists
        case = make_bare_case(db, registrar_id=registrar.id)
        first = upsert(db, case.id, TumorRegistryUpsert(grade="G2"), user_id=path1.id)

        result = upsert(db, case.id, TumorRegistryUpsert(grade="G3"), user_id=path2.id)

        assert result.id == first.id
        assert result.grade == "G3"
        # created_by_id reflects who created the row, not who last updated it —
        # TumorRegistryUpsert has no created_by_id field, so the update loop
        # (driven by exclude_unset) can never touch it.
        assert result.created_by_id == path1.id

    def test_only_touches_fields_explicitly_set_on_update(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        upsert(db, case.id, TumorRegistryUpsert(grade="G2", pt="T2"), user_id=registrar.id)

        result = upsert(db, case.id, TumorRegistryUpsert(pt="T3"), user_id=registrar.id)

        assert result.pt == "T3"
        assert result.grade == "G2"  # untouched
