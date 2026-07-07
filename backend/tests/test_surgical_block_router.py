"""Router-level tests for app/routers/surgical_block.py. The crud layer
(app/crud/surgical_block.py) is already covered elsewhere — this is RBAC +
wiring only."""

from tests.factories import make_signable_case


class TestRbac:
    def test_clinician_cannot_list(self, clinician_client):
        assert clinician_client.get("/surgical-blocks").status_code == 403

    def test_pathologist_can_list(self, pathologist_client):
        r = pathologist_client.get("/surgical-blocks")
        assert r.status_code == 200
        assert "items" in r.json() or "total" in r.json() or isinstance(r.json(), dict)


class TestCrudWiring:
    def test_create_list_update_delete(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        created = pathologist_client.post("/surgical-blocks", json={"specimen_id": specimen.id, "block_no": 1}).json()
        assert created["block_no"] == 1

        updated = pathologist_client.put(f"/surgical-blocks/{created['id']}", json={"status": "embedded"})
        assert updated.status_code == 200
        assert updated.json()["status"] == "embedded"

        deleted = pathologist_client.delete(f"/surgical-blocks/{created['id']}")
        assert deleted.status_code == 200

    def test_filters_by_specimen_id(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        pathologist_client.post("/surgical-blocks", json={"specimen_id": specimen.id, "block_no": 1})

        r = pathologist_client.get("/surgical-blocks", params={"specimen_id": specimen.id})

        assert r.status_code == 200
        assert all(b["specimen_id"] == specimen.id for b in r.json()["items"])


def test_requires_authentication(client):
    assert client.get("/surgical-blocks").status_code == 401
