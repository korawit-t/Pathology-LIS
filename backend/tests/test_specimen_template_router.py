"""Router-level tests for app/routers/specimen_template.py — any
authenticated user; this router defines its own inline pydantic schemas and
duplicate-name / reorder logic isn't covered anywhere else (no dedicated
crud module), so it gets fuller coverage than the thinner routers."""

import uuid


def _name():
    return f"Specimen {uuid.uuid4().hex[:8]}"


class TestCreate:
    def test_creates_with_defaults(self, clinician_client):
        r = clinician_client.post("/specimen-templates", json={"name": _name()})
        assert r.status_code == 200
        body = r.json()
        assert body["category"] == "surgical"
        assert body["default_slide_count"] == 1

    def test_rejects_duplicate_name_within_the_same_category(self, clinician_client):
        name = _name()
        clinician_client.post("/specimen-templates", json={"name": name, "category": "surgical"})
        r = clinician_client.post("/specimen-templates", json={"name": name, "category": "surgical"})
        assert r.status_code == 400

    def test_allows_the_same_name_in_a_different_category(self, clinician_client):
        name = _name()
        r1 = clinician_client.post("/specimen-templates", json={"name": name, "category": "surgical"})
        r2 = clinician_client.post("/specimen-templates", json={"name": name, "category": "gyne"})
        assert r1.status_code == 200
        assert r2.status_code == 200

    def test_appends_to_the_end_of_sort_order(self, clinician_client):
        cat = f"cat_{uuid.uuid4().hex[:8]}"
        first = clinician_client.post("/specimen-templates", json={"name": _name(), "category": cat}).json()
        second = clinician_client.post("/specimen-templates", json={"name": _name(), "category": cat}).json()
        assert second["sort_order"] > first["sort_order"]


class TestReorder:
    def test_persists_the_given_order(self, clinician_client):
        cat = f"cat_{uuid.uuid4().hex[:8]}"
        a = clinician_client.post("/specimen-templates", json={"name": _name(), "category": cat}).json()
        b = clinician_client.post("/specimen-templates", json={"name": _name(), "category": cat}).json()

        r = clinician_client.patch("/specimen-templates/reorder", json={"category": cat, "ids": [b["id"], a["id"]]})

        assert r.status_code == 200
        ordered = r.json()
        assert [item["id"] for item in ordered] == [b["id"], a["id"]]


class TestUpdate:
    def test_rejects_a_name_already_used_by_another_template(self, clinician_client):
        cat = f"cat_{uuid.uuid4().hex[:8]}"
        existing_name = _name()
        clinician_client.post("/specimen-templates", json={"name": existing_name, "category": cat})
        target = clinician_client.post("/specimen-templates", json={"name": _name(), "category": cat}).json()

        r = clinician_client.patch(f"/specimen-templates/{target['id']}", json={"name": existing_name})

        assert r.status_code == 400

    def test_missing_id_returns_404(self, clinician_client):
        assert clinician_client.patch("/specimen-templates/999999", json={"name": _name()}).status_code == 404


class TestDelete:
    def test_deletes_existing(self, clinician_client):
        created = clinician_client.post("/specimen-templates", json={"name": _name()}).json()
        r = clinician_client.delete(f"/specimen-templates/{created['id']}")
        assert r.status_code == 200

    def test_missing_id_returns_404(self, clinician_client):
        assert clinician_client.delete("/specimen-templates/999999").status_code == 404


def test_requires_authentication(client):
    assert client.get("/specimen-templates").status_code == 401
