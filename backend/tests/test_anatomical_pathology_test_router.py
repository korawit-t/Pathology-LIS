"""Router-level tests for app/routers/anatomical_pathology_test.py. The crud
layer itself isn't re-tested here (see test_anatomical_pathology_test.py) —
this covers RBAC gates, status codes, and request/response wiring.

Note: admin_client/pathologist_client/clinician_client/etc. all wrap the
SAME underlying TestClient (they share the function-scoped `client` fixture
and just log in with different credentials) — combining two of them in one
test makes both aliases point at whichever logged in last, not two
independent identities. Every test below uses exactly one role-client, and
any prerequisite data is created directly via the crud layer/db fixture
instead of through another role's client."""

import uuid

from app.crud.anatomical_pathology_test import create_test
from app.schemas.anatomical_pathology_test import AnatomicalPathologyTestCreate


def _test_in(**overrides):
    fields = dict(name=f"Test {uuid.uuid4().hex[:8]}", category="IHC", price_tier_1=100)
    fields.update(overrides)
    return fields


def _make_test(db, **overrides):
    return create_test(db, AnatomicalPathologyTestCreate(**_test_in(**overrides)))


class TestCreate:
    def test_admin_can_create(self, admin_client):
        r = admin_client.post("/anatomical-pathology-tests", json=_test_in())
        assert r.status_code == 200
        assert r.json()["name"].startswith("Test ")

    def test_clinician_cannot_create(self, clinician_client):
        r = clinician_client.post("/anatomical-pathology-tests", json=_test_in())
        assert r.status_code == 403

    def test_pathologist_cannot_create(self, pathologist_client):
        # Only "admin" is in the allowed roles for create/update/delete
        r = pathologist_client.post("/anatomical-pathology-tests", json=_test_in())
        assert r.status_code == 403


class TestReadAll:
    def test_pathologist_can_read(self, db, pathologist_client):
        _make_test(db)
        r = pathologist_client.get("/anatomical-pathology-tests")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_clinician_cannot_read(self, clinician_client):
        r = clinician_client.get("/anatomical-pathology-tests")
        assert r.status_code == 403

    def test_filters_by_category(self, db, admin_client):
        _make_test(db, category="Histochem")
        r = admin_client.get("/anatomical-pathology-tests", params={"category": "Histochem"})
        assert r.status_code == 200
        assert all(t["category"] == "Histochem" for t in r.json())


class TestReadById:
    def test_returns_404_for_missing_id(self, admin_client):
        r = admin_client.get("/anatomical-pathology-tests/999999")
        assert r.status_code == 404

    def test_returns_the_item(self, db, admin_client):
        created = _make_test(db)
        r = admin_client.get(f"/anatomical-pathology-tests/{created.id}")
        assert r.status_code == 200
        assert r.json()["id"] == created.id


class TestUpdate:
    def test_admin_can_update(self, db, admin_client):
        created = _make_test(db)
        r = admin_client.put(f"/anatomical-pathology-tests/{created.id}", json=_test_in(name="Renamed"))
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed"

    def test_clinician_cannot_update(self, db, clinician_client):
        created = _make_test(db)
        r = clinician_client.put(f"/anatomical-pathology-tests/{created.id}", json=_test_in())
        assert r.status_code == 403

    def test_returns_404_for_missing_id(self, admin_client):
        r = admin_client.put("/anatomical-pathology-tests/999999", json=_test_in())
        assert r.status_code == 404


class TestDelete:
    def test_admin_can_delete(self, db, admin_client):
        created = _make_test(db)
        r = admin_client.delete(f"/anatomical-pathology-tests/{created.id}")
        assert r.status_code == 200
        assert admin_client.get(f"/anatomical-pathology-tests/{created.id}").status_code == 404

    def test_clinician_cannot_delete(self, db, clinician_client):
        created = _make_test(db)
        r = clinician_client.delete(f"/anatomical-pathology-tests/{created.id}")
        assert r.status_code == 403
