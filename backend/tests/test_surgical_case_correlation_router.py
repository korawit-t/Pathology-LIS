"""Router-level tests for app/routers/surgical_case_correlation.py. The
crud layer already has thorough coverage in test_surgical_case_correlation.py
— this is RBAC (reads: any authenticated user; writes: CAN_WRITE_REPORT) +
wiring only."""

from tests.factories import make_bare_case


class TestRbac:
    def test_clinician_can_read(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)

        r = clinician_client.get(f"/surgical-case-correlations/by-case/{case.id}")

        assert r.status_code == 200

    def test_clinician_cannot_create(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)

        r = clinician_client.post(
            "/surgical-case-correlations",
            json={
                "from_case_id": case_a.id, "to_case_id": case_b.id,
                "from_accession_no": case_a.accession_no, "to_accession_no": case_b.accession_no,
                "correlation_result": "agree",
            },
        )

        assert r.status_code == 403


class TestCrudWiring:
    def test_create_update_delete(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)

        created = pathologist_client.post(
            "/surgical-case-correlations",
            json={
                "from_case_id": case_a.id, "to_case_id": case_b.id,
                "from_accession_no": case_a.accession_no, "to_accession_no": case_b.accession_no,
                "correlation_result": "agree",
            },
        )
        assert created.status_code == 200
        correlation_id = created.json()["id"]

        updated = pathologist_client.put(
            f"/surgical-case-correlations/{correlation_id}", json={"correlation_result": "minor_discrepancy"}
        )
        assert updated.status_code == 200
        assert updated.json()["correlation_result"] == "minor_discrepancy"

        deleted = pathologist_client.delete(f"/surgical-case-correlations/{correlation_id}")
        assert deleted.status_code == 204

    def test_update_missing_returns_404(self, pathologist_client):
        r = pathologist_client.put("/surgical-case-correlations/999999", json={"comment": "x"})
        assert r.status_code == 404

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/surgical-case-correlations/999999").status_code == 404


def test_requires_authentication(client):
    assert client.get("/surgical-case-correlations/by-case/1").status_code == 401
