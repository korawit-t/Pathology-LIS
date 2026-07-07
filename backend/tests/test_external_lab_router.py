"""Router-level tests for app/routers/external_lab.py. The router only
requires `get_current_user` (any authenticated user, no role check) on every
route including create/update/delete — these tests document that current,
permissive behavior rather than assuming a stricter policy that isn't
actually coded. See the RBAC-consistency note reported at the end of the
app/routers/ batch for whether this (and similarly loose master-data
routers) should be tightened."""

import uuid

from app.crud.external_lab import create_external_lab
from app.schemas.external_lab import ExternalLabCreate


def _name():
    return f"RefLab {uuid.uuid4().hex[:8]}"


class TestExternalLabRouterAnyAuthenticatedUser:
    def test_clinician_can_list(self, db, clinician_client):
        create_external_lab(db, ExternalLabCreate(name=_name()))
        r = clinician_client.get("/external-labs")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_clinician_can_create(self, clinician_client):
        r = clinician_client.post("/external-labs", json={"name": _name()})
        assert r.status_code == 200

    def test_clinician_can_update(self, db, clinician_client):
        lab = create_external_lab(db, ExternalLabCreate(name=_name()))
        r = clinician_client.put(f"/external-labs/{lab.id}", json={"description": "Updated"})
        assert r.status_code == 200
        assert r.json()["description"] == "Updated"

    def test_clinician_can_delete(self, db, clinician_client):
        lab = create_external_lab(db, ExternalLabCreate(name=_name()))
        r = clinician_client.delete(f"/external-labs/{lab.id}")
        assert r.status_code == 200


class TestExternalLabRouterWiring:
    def test_active_only_filter(self, db, admin_client):
        create_external_lab(db, ExternalLabCreate(name=_name(), is_active=True))
        create_external_lab(db, ExternalLabCreate(name=_name(), is_active=False))
        r = admin_client.get("/external-labs", params={"active_only": True})
        assert r.status_code == 200
        assert all(lab["is_active"] for lab in r.json())

    def test_get_missing_returns_404(self, admin_client):
        assert admin_client.get("/external-labs/999999").status_code == 404

    def test_update_missing_returns_404(self, admin_client):
        assert admin_client.put("/external-labs/999999", json={"name": "x"}).status_code == 404

    def test_delete_missing_returns_404(self, admin_client):
        assert admin_client.delete("/external-labs/999999").status_code == 404

    def test_requires_authentication(self, client):
        r = client.get("/external-labs")
        assert r.status_code == 401
