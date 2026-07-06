"""Unit tests for the multi-hospital-per-user mechanism: the
get_scoped_hospital_ids/assert_hospital_scoped_access helpers in
app.dependencies.auth, and hospital_ids handling in app.crud.user."""

import uuid

from app.dependencies.auth import assert_hospital_scoped_access, get_scoped_hospital_ids
from app.crud.user import create_user, update_user
from app.schemas.user import UserCreate, UserUpdate
from tests.conftest import _make_user
from tests.factories import make_hospital


class TestGetScopedHospitalIds:
    def test_internal_staff_are_unrestricted(self, db, pathologist_user):
        user, _ = pathologist_user
        assert get_scoped_hospital_ids(user) is None

    def test_external_user_with_no_hospitals_gets_empty_set(self, db):
        user, _ = _make_user(db, f"clin_{uuid.uuid4().hex[:6]}", "ClinPass1!", ["clinician"])
        assert get_scoped_hospital_ids(user) == set()

    def test_external_user_with_hospitals_gets_correct_set(self, db):
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        user, _ = _make_user(db, f"clin_{uuid.uuid4().hex[:6]}", "ClinPass1!", ["clinician"])
        user.hospitals = [hosp_a, hosp_b]
        db.commit()

        assert get_scoped_hospital_ids(user) == {hosp_a.id, hosp_b.id}


class TestAssertHospitalScopedAccess:
    def test_internal_staff_never_denied(self, db, pathologist_user):
        user, _ = pathologist_user
        assert_hospital_scoped_access(user, None)
        assert_hospital_scoped_access(user, 12345)  # no exception raised

    def test_external_user_denied_outside_assigned_hospitals(self, db):
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        user, _ = _make_user(db, f"clin_{uuid.uuid4().hex[:6]}", "ClinPass1!", ["clinician"])
        user.hospitals = [hosp_a]
        db.commit()

        import pytest
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            assert_hospital_scoped_access(user, hosp_b.id)
        assert exc_info.value.status_code == 403

        assert_hospital_scoped_access(user, hosp_a.id)  # no exception


class TestCrudUserHospitalIds:
    def test_create_user_populates_hospitals(self, db):
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        payload = UserCreate(
            username=f"u_{uuid.uuid4().hex[:6]}",
            password="SomePass1!",
            roles=["clinician"],
            hospital_ids=[hosp_a.id, hosp_b.id],
        )
        user = create_user(db, payload)

        assert {h.id for h in user.hospitals} == {hosp_a.id, hosp_b.id}
        assert set(user.hospital_ids) == {hosp_a.id, hosp_b.id}

    def test_update_user_replaces_hospitals(self, db):
        hosp_a = make_hospital(db)
        hosp_b = make_hospital(db)
        hosp_c = make_hospital(db)
        user, _ = _make_user(db, f"clin_{uuid.uuid4().hex[:6]}", "ClinPass1!", ["clinician"])
        user.hospitals = [hosp_a]
        db.commit()

        updated = update_user(db, user.id, UserUpdate(hospital_ids=[hosp_b.id, hosp_c.id]))

        assert {h.id for h in updated.hospitals} == {hosp_b.id, hosp_c.id}

    def test_update_user_can_clear_hospitals(self, db):
        hosp_a = make_hospital(db)
        user, _ = _make_user(db, f"clin_{uuid.uuid4().hex[:6]}", "ClinPass1!", ["clinician"])
        user.hospitals = [hosp_a]
        db.commit()

        updated = update_user(db, user.id, UserUpdate(hospital_ids=[]))

        assert updated.hospitals == []
