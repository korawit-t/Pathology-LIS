"""Tests for app/crud/user.py — user CRUD, the roles-array containment
filter in get_users, create_user's forced is_temporary_password=True (the
incoming schema's own is_temporary_password value is discarded — a new
user always starts under forced-password-change), and the two paths that
must each independently flip is_temporary_password (admin-driven update_user
sets it True when a password is included; user-driven update_user_password
sets it False)."""

import uuid

from app.crud.user import (
    get_user,
    get_users,
    create_user,
    update_user,
    delete_user,
    update_user_password,
)
from app.schemas.user import UserCreate, UserUpdate
from app.models.user import User


def _create(db, roles=None, status=True, **overrides):
    fields = dict(
        username=f"user_{uuid.uuid4().hex[:8]}",
        password="InitialPass1!",
        roles=roles or ["pathologist"],
        status=status,
    )
    fields.update(overrides)
    return create_user(db, UserCreate(**fields))


class TestGetUser:
    def test_missing_returns_none(self, db):
        assert get_user(db, 999999) is None

    def test_found(self, db):
        user = _create(db)
        assert get_user(db, user.id).id == user.id


class TestGetUsers:
    def test_filters_by_role_membership(self, db):
        path_user = _create(db, roles=["pathologist"])
        clinician_user = _create(db, roles=["clinician"])

        results = get_users(db, role="pathologist")
        result_ids = [u.id for u in results]

        assert path_user.id in result_ids
        assert clinician_user.id not in result_ids

    def test_filters_by_status(self, db):
        active = _create(db, status=True)
        inactive = _create(db, status=False)

        active_results = [u.id for u in get_users(db, status=True)]
        inactive_results = [u.id for u in get_users(db, status=False)]

        assert active.id in active_results
        assert active.id not in inactive_results
        assert inactive.id in inactive_results

    def test_role_matches_any_element_in_multi_role_user(self, db):
        multi_role = _create(db, roles=["pathologist", "admin"])

        results = [u.id for u in get_users(db, role="admin")]

        assert multi_role.id in results


class TestCreateUser:
    def test_always_forces_temporary_password_true(self, db):
        user = _create(db, is_temporary_password=False)  # client tries to opt out

        assert user.is_temporary_password is True

    def test_hashes_password_not_stored_in_plaintext(self, db):
        user = _create(db, password="PlainTextPass1!")

        assert user.hashed_password != "PlainTextPass1!"


class TestUpdateUser:
    def test_missing_returns_none(self, db):
        assert update_user(db, 999999, UserUpdate(full_name="x")) is None

    def test_updates_provided_fields_only(self, db):
        user = _create(db, full_name="Original Name")

        updated = update_user(db, user.id, UserUpdate(full_name="New Name"))

        assert updated.full_name == "New Name"
        assert updated.username == user.username  # untouched

    def test_password_change_rehashes_and_forces_temporary_flag(self, db):
        user = _create(db)
        user.is_temporary_password = False
        db.commit()
        original_hash = user.hashed_password

        updated = update_user(db, user.id, UserUpdate(password="BrandNewPass1!"))

        assert updated.hashed_password != original_hash
        assert updated.is_temporary_password is True

    def test_update_without_password_does_not_touch_temporary_flag(self, db):
        user = _create(db)
        user.is_temporary_password = False
        db.commit()

        updated = update_user(db, user.id, UserUpdate(full_name="Only Name Change"))

        assert updated.is_temporary_password is False


class TestDeleteUser:
    def test_missing_returns_none(self, db):
        assert delete_user(db, 999999) is None

    def test_deletes_existing(self, db):
        user = _create(db)

        assert delete_user(db, user.id) is True
        assert db.query(User).filter(User.id == user.id).first() is None


class TestUpdateUserPassword:
    def test_missing_returns_none(self, db):
        assert update_user_password(db, 999999, "NewPass1!") is None

    def test_clears_temporary_flag_and_stamps_last_update(self, db):
        user = _create(db)
        assert user.is_temporary_password is True
        original_hash = user.hashed_password

        updated = update_user_password(db, user.id, "SelfChosenPass1!")

        assert updated.is_temporary_password is False
        assert updated.last_update_password is not None
        assert updated.hashed_password != original_hash
