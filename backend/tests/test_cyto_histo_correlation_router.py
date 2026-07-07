"""Router-level tests for app/routers/cyto_histo_correlation.py. The crud
layer already has thorough coverage in test_cyto_histo_correlation.py
(classification helpers, summary aggregation) — this is RBAC (reads: any
authenticated user; writes: CAN_WRITE_REPORT) + wiring only."""

from tests.factories import make_bare_nongyne_case


class TestRbac:
    def test_clinician_can_read_summary(self, clinician_client):
        assert clinician_client.get("/cyto-histo-correlations/summary").status_code == 200

    def test_clinician_cannot_create(self, clinician_client):
        r = clinician_client.post(
            "/cyto-histo-correlations",
            json={"case_type": "nongyne", "surgical_accession_no": "S26-0001", "correlation_result": "agree"},
        )
        assert r.status_code == 403


class TestCrudWiring:
    def test_create_update_delete(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        created = pathologist_client.post(
            "/cyto-histo-correlations",
            json={
                "case_type": "nongyne", "nongyne_case_id": case.id,
                "surgical_accession_no": "S26-0001", "correlation_result": "agree",
            },
        )
        assert created.status_code == 200
        correlation_id = created.json()["id"]

        updated = pathologist_client.put(
            f"/cyto-histo-correlations/{correlation_id}", json={"correlation_result": "major_discrepancy"}
        )
        assert updated.status_code == 200
        assert updated.json()["correlation_result"] == "major_discrepancy"

        deleted = pathologist_client.delete(f"/cyto-histo-correlations/{correlation_id}")
        assert deleted.status_code == 204

    def test_update_missing_returns_404(self, pathologist_client):
        assert pathologist_client.put("/cyto-histo-correlations/999999", json={"comment": "x"}).status_code == 404

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/cyto-histo-correlations/999999").status_code == 404

    def test_list_and_hsil_discordant_reachable(self, pathologist_client):
        assert pathologist_client.get("/cyto-histo-correlations").status_code == 200
        assert pathologist_client.get("/cyto-histo-correlations/hsil-discordant", params={"result": "agree"}).status_code == 200


def test_requires_authentication(client):
    assert client.get("/cyto-histo-correlations/summary").status_code == 401
