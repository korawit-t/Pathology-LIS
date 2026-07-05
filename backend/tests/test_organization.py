"""Tests for app/crud/organization.py — thin master-data CRUD (Hospital,
Position, Title, MedicalScheme, Department, Holiday, SystemConfig). Kept
lean since there's no branching logic beyond exists-or-not guards, except
bulk_create_holidays' dedup-by-date and set_system_config's upsert."""

import uuid
from datetime import date, timedelta

from app.crud.organization import (
    create_hospital, update_hospital, delete_hospital,
    create_position, update_position, delete_position,
    create_title, update_title, delete_title,
    create_medical_scheme, update_medical_scheme, delete_medical_scheme,
    create_department, update_department, delete_department, get_departments,
    create_holiday, delete_holiday, get_holiday_by_date,
    get_system_config, set_system_config,
    bulk_create_holidays,
)
from app.schemas.organization import (
    HospitalCreate, HospitalUpdate,
    PositionCreate, PositionUpdate,
    TitleCreate, TitleUpdate,
    MedicalSchemeCreate, MedicalSchemeUpdate,
    DepartmentCreate, DepartmentUpdate,
    HolidayCreate,
)


class TestHospitalCrud:
    def test_create_update_delete(self, db):
        hospital = create_hospital(db, HospitalCreate(name=f"H-{uuid.uuid4().hex[:8]}"))
        assert hospital.id is not None

        updated = update_hospital(db, hospital.id, HospitalUpdate(address="New Address"))
        assert updated.address == "New Address"

        assert delete_hospital(db, hospital.id) is True
        assert delete_hospital(db, hospital.id) is False

    def test_update_missing_returns_none(self, db):
        assert update_hospital(db, 999999, HospitalUpdate(name="x")) is None


class TestPositionCrud:
    def test_create_update_delete(self, db):
        pos = create_position(db, PositionCreate(name=f"Pos-{uuid.uuid4().hex[:8]}"))
        updated = update_position(db, pos.id, PositionUpdate(description="desc"))
        assert updated.description == "desc"
        assert delete_position(db, pos.id) is True
        assert delete_position(db, 999999) is False


class TestTitleCrud:
    def test_create_update_delete(self, db):
        title = create_title(db, TitleCreate(title=f"Dr-{uuid.uuid4().hex[:8]}"))
        updated = update_title(db, title.id, TitleUpdate(title="Prof"))
        assert updated.title == "Prof"
        assert delete_title(db, title.id) is True
        assert delete_title(db, 999999) is False


class TestMedicalSchemeCrud:
    def test_create_update_delete(self, db):
        scheme = create_medical_scheme(db, MedicalSchemeCreate(name=f"Scheme-{uuid.uuid4().hex[:8]}"))
        updated = update_medical_scheme(db, scheme.id, MedicalSchemeUpdate(code="SC1"))
        assert updated.code == "SC1"
        assert delete_medical_scheme(db, scheme.id) is True
        assert delete_medical_scheme(db, 999999) is False


class TestDepartmentCrud:
    def test_create_update_delete(self, db):
        dept = create_department(db, DepartmentCreate(name=f"Dept-{uuid.uuid4().hex[:8]}"))
        assert dept.is_active is True

        updated = update_department(db, dept.id, DepartmentUpdate(is_active=False))
        assert updated.is_active is False

        deleted = delete_department(db, dept.id)
        assert deleted is not None
        assert delete_department(db, 999999) is None

    def test_get_departments_active_only_filter(self, db):
        active = create_department(db, DepartmentCreate(name=f"Active-{uuid.uuid4().hex[:8]}", is_active=True))
        inactive = create_department(db, DepartmentCreate(name=f"Inactive-{uuid.uuid4().hex[:8]}", is_active=False))

        result_ids = [d.id for d in get_departments(db, active_only=True, limit=1000)]
        assert active.id in result_ids
        assert inactive.id not in result_ids


class TestHolidayCrud:
    def test_create_get_by_date_delete(self, db):
        d = date(2027, 1, 1)
        # Clear any pre-existing holiday on this exact date from another test run.
        existing = get_holiday_by_date(db, d)
        if existing:
            delete_holiday(db, existing.id)

        holiday = create_holiday(db, HolidayCreate(holiday_date=d, name="New Year"))
        assert get_holiday_by_date(db, d).id == holiday.id
        assert delete_holiday(db, holiday.id) is True
        assert delete_holiday(db, 999999) is False


class TestBulkCreateHolidays:
    def test_skips_existing_dates(self, db):
        d1 = date(2027, 5, 1)
        d2 = date(2027, 5, 2)
        for d in (d1, d2):
            existing = get_holiday_by_date(db, d)
            if existing:
                delete_holiday(db, existing.id)

        created1, skipped1 = bulk_create_holidays(db, [
            {"holiday_date": d1, "name": "Labour Day"},
            {"holiday_date": d2, "name": "Day 2"},
        ])
        assert created1 == 2
        assert skipped1 == 0

        created2, skipped2 = bulk_create_holidays(db, [
            {"holiday_date": d1, "name": "Labour Day (dup)"},
            {"holiday_date": date(2027, 5, 3), "name": "Day 3"},
        ])
        assert created2 == 1  # only the new date
        assert skipped2 == 1  # d1 already existed


class TestSystemConfig:
    def test_set_creates_then_updates(self, db):
        key = f"config-{uuid.uuid4().hex[:8]}"
        assert get_system_config(db, key) is None

        created = set_system_config(db, key, {"a": 1})
        assert created.value == {"a": 1}

        updated = set_system_config(db, key, {"a": 2})
        assert updated.value == {"a": 2}
        assert updated.key == created.key  # same row, not duplicated
        assert db.query(type(created)).filter(type(created).key == key).count() == 1
