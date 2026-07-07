"""Router-level tests for app/routers/organization.py. The crud layer is
already covered by test_organization.py — this covers RBAC (a real mix of
CAN_MANAGE_SETTINGS-gated and merely-authenticated routes within the same
file — see TestTitleCreateRbacInconsistency) and the router-only business
logic that lives nowhere else: Google Calendar config masking/merge and
the holiday-import parsing."""

import uuid

from app.crud import organization as crud
from app.schemas.organization import TitleCreate, DepartmentCreate


def _name(label):
    return f"{label} {uuid.uuid4().hex[:8]}"


class TestHospitals:
    def test_any_authenticated_user_can_read(self, clinician_client):
        assert clinician_client.get("/org/hospitals").status_code == 200

    def test_admin_can_create(self, admin_client):
        r = admin_client.post("/org/hospitals", json={"name": _name("Hosp")})
        assert r.status_code == 200

    def test_clinician_cannot_create(self, clinician_client):
        r = clinician_client.post("/org/hospitals", json={"name": _name("Hosp")})
        assert r.status_code == 403

    def test_lab_manager_can_create(self, lab_manager_client):
        # CAN_MANAGE_SETTINGS includes lab_manager, unlike CAN_MANAGE_SYSTEM_SETTINGS
        r = lab_manager_client.post("/org/hospitals", json={"name": _name("Hosp")})
        assert r.status_code == 200

    def test_update_missing_returns_404(self, admin_client):
        assert admin_client.put("/org/hospitals/999999", json={"name": "x"}).status_code == 404

    def test_delete_missing_returns_404(self, admin_client):
        assert admin_client.delete("/org/hospitals/999999").status_code == 404


class TestPositions:
    def test_any_authenticated_user_can_read(self, clinician_client):
        assert clinician_client.get("/org/positions").status_code == 200

    def test_clinician_cannot_create(self, clinician_client):
        assert clinician_client.post("/org/positions", json={"name": _name("Pos")}).status_code == 403

    def test_admin_can_create_update_delete(self, admin_client):
        created = admin_client.post("/org/positions", json={"name": _name("Pos")}).json()
        updated = admin_client.put(f"/org/positions/{created['id']}", json={"name": "Renamed"})
        assert updated.status_code == 200
        deleted = admin_client.delete(f"/org/positions/{created['id']}")
        assert deleted.status_code == 200


class TestTitleCreateRbacInconsistency:
    """Documents an inconsistency within this same router: title
    create/read only require being logged in, while title update/delete
    require CAN_MANAGE_SETTINGS — reported alongside the other
    permissiveness findings from the app/routers/ batch, not assumed to be
    a bug."""

    def test_clinician_can_create_a_title(self, clinician_client):
        r = clinician_client.post("/org/titles", json={"title": _name("Dr.")})
        assert r.status_code == 200

    def test_clinician_cannot_update_a_title(self, db, clinician_client):
        created = crud.create_title(db, TitleCreate(title=_name("Dr.")))
        r = clinician_client.put(f"/org/titles/{created.id}", json={"title": "Renamed"})
        assert r.status_code == 403

    def test_clinician_cannot_delete_a_title(self, db, clinician_client):
        created = crud.create_title(db, TitleCreate(title=_name("Dr.")))
        r = clinician_client.delete(f"/org/titles/{created.id}")
        assert r.status_code == 403


class TestMedicalSchemes:
    def test_clinician_can_read_and_create(self, clinician_client):
        assert clinician_client.get("/org/medical-schemes").status_code == 200
        r = clinician_client.post("/org/medical-schemes", json={"name": _name("Scheme")})
        assert r.status_code == 200


class TestDepartments:
    def test_clinician_can_read_and_create(self, clinician_client):
        assert clinician_client.get("/org/departments").status_code == 200
        r = clinician_client.post("/org/departments", json={"name": _name("Dept")})
        assert r.status_code == 200

    def test_clinician_cannot_update_or_delete(self, db, clinician_client):
        created = crud.create_department(db, DepartmentCreate(name=_name("Dept")))
        assert clinician_client.patch(f"/org/departments/{created.id}", json={"name": "x"}).status_code == 403
        assert clinician_client.delete(f"/org/departments/{created.id}").status_code == 403

    def test_read_missing_department_returns_404(self, clinician_client):
        assert clinician_client.get("/org/departments/999999").status_code == 404


class TestHolidays:
    def test_clinician_can_read_but_not_create(self, clinician_client):
        assert clinician_client.get("/org/holidays").status_code == 200
        r = clinician_client.post("/org/holidays", json={"holiday_date": "2026-12-25", "name": "Christmas"})
        assert r.status_code == 403

    def test_admin_cannot_create_a_duplicate_date(self, admin_client):
        payload = {"holiday_date": "2026-04-13", "name": "Songkran"}
        first = admin_client.post("/org/holidays", json=payload)
        assert first.status_code == 200
        second = admin_client.post("/org/holidays", json=payload)
        assert second.status_code == 400

    def test_admin_can_delete(self, admin_client):
        created = admin_client.post("/org/holidays", json={"holiday_date": "2026-05-01", "name": "Labour Day"}).json()
        assert admin_client.delete(f"/org/holidays/{created['id']}").status_code == 200


class TestGoogleCalendarConfig:
    def test_no_config_and_no_env_key_reports_source_none(self, admin_client, monkeypatch):
        monkeypatch.delenv("GOOGLE_CALENDAR_API_KEY", raising=False)
        r = admin_client.get("/org/config/google-calendar")
        assert r.status_code == 200
        assert r.json()["source"] == "none"
        assert r.json()["api_key"] == ""

    def test_clinician_cannot_read_config(self, clinician_client):
        assert clinician_client.get("/org/config/google-calendar").status_code == 403

    def test_saving_masks_the_key_on_the_next_read(self, admin_client):
        r = admin_client.put("/org/config/google-calendar", json={"api_key": "AIzaSyABCDEFGHIJKLMNOP", "calendar_id": "test@example.com"})
        assert r.status_code == 200

        read_back = admin_client.get("/org/config/google-calendar").json()
        assert read_back["api_key"].endswith("MNOP")
        assert read_back["api_key"].startswith("*")
        assert read_back["source"] == "db"

    def test_saving_a_fully_masked_key_preserves_the_existing_one(self, admin_client):
        admin_client.put("/org/config/google-calendar", json={"api_key": "AIzaSyABCDEFGHIJKLMNOP"})
        masked = admin_client.get("/org/config/google-calendar").json()["api_key"]

        # Simulate the frontend re-submitting the masked value unchanged
        admin_client.put("/org/config/google-calendar", json={"api_key": masked, "calendar_id": "new-cal@example.com"})

        read_back = admin_client.get("/org/config/google-calendar").json()
        assert read_back["api_key"].endswith("MNOP")  # original key preserved, not overwritten with asterisks


class TestImportHolidaysFromGoogleCalendar:
    def test_no_api_key_configured_returns_400(self, db, admin_client, monkeypatch):
        # google_calendar is a real, singleton system-config row — another
        # test in this file may have already saved a key to it (a real,
        # persisted commit), so explicitly clear it rather than assuming
        # a fresh/absent config.
        crud.set_system_config(db, "google_calendar", {})
        monkeypatch.delenv("GOOGLE_CALENDAR_API_KEY", raising=False)
        r = admin_client.post("/org/holidays/import-google-calendar", json={"year": 2026})
        assert r.status_code == 400

    def test_parses_events_into_holidays_and_reports_counts(self, admin_client, monkeypatch):
        import httpx as httpx_module

        admin_client.put("/org/config/google-calendar", json={"api_key": "real-test-key"})

        class FakeResponse:
            status_code = 200
            def raise_for_status(self):
                pass
            def json(self):
                return {
                    "items": [
                        {"start": {"date": "2026-01-01"}, "summary": "New Year"},
                        {"start": {"dateTime": "2026-12-25T00:00:00Z"}, "summary": "Christmas"},
                        {"start": {}, "summary": "No date, should be skipped"},
                    ]
                }

        monkeypatch.setattr(httpx_module, "get", lambda *a, **k: FakeResponse())

        r = admin_client.post("/org/holidays/import-google-calendar", json={"year": 2026})

        assert r.status_code == 200
        body = r.json()
        assert body["total_fetched"] == 2
        assert body["created"] == 2

    def test_google_api_error_becomes_502(self, admin_client, monkeypatch):
        import httpx as httpx_module
        from unittest.mock import patch

        admin_client.put("/org/config/google-calendar", json={"api_key": "real-test-key"})

        def raise_http_error(*a, **k):
            request = httpx_module.Request("GET", "https://example.com")
            response = httpx_module.Response(403, request=request)
            raise httpx_module.HTTPStatusError("forbidden", request=request, response=response)

        with patch("httpx.get", side_effect=raise_http_error):
            r = admin_client.post("/org/holidays/import-google-calendar", json={"year": 2026})

        assert r.status_code == 502


def test_requires_authentication(client):
    assert client.get("/org/hospitals").status_code == 401
