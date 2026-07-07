"""Router-level tests for app/routers/outlab_consult.py. The crud layer
(app/crud/outlab_consult.py) already has thorough lifecycle coverage in
test_outlab_consult.py — this is auth/wiring only.

NOTABLE FINDING (documented, not fixed — see the consolidated RBAC report):
every route here is gated only by get_current_user (any authenticated
user, no role check), same pattern as slide_block_release/slide_dispatch
in this same group."""

from tests.factories import make_bare_case


class TestAuth:
    def test_requires_authentication(self, client):
        assert client.get("/outlab-consult-runs").status_code == 401

    def test_any_authenticated_role_can_create_and_list(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)

        created = clinician_client.post(
            "/outlab-consult-runs",
            json={
                "destination_lab": "Reference Lab A",
                "cases": [{"case_type": "surgical", "case_id": case.id, "accession_no": case.accession_no}],
            },
        )
        assert created.status_code == 201

        r = clinician_client.get("/outlab-consult-runs")
        assert r.status_code == 200
        assert any(run["id"] == created.json()["id"] for run in r.json())


class TestLifecycleWiring:
    def test_receive_and_update_tracking(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            "/outlab-consult-runs",
            json={
                "destination_lab": "Reference Lab A",
                "cases": [{"case_type": "surgical", "case_id": case.id}],
            },
        ).json()

        tracked = pathologist_client.patch(
            f"/outlab-consult-runs/{created['id']}/tracking", json={"tracking_number": "TRACK-123"}
        )
        assert tracked.status_code == 200
        assert tracked.json()["tracking_number"] == "TRACK-123"

        received = pathologist_client.patch(f"/outlab-consult-runs/{created['id']}/receive")
        assert received.status_code == 200
        assert received.json()["status"] == "received"

    def test_return_block(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            "/outlab-consult-runs",
            json={
                "destination_lab": "Reference Lab A",
                "cases": [{"case_type": "surgical", "case_id": case.id}],
            },
        ).json()
        detail_id = created["details"][0]["id"]

        r = pathologist_client.patch(f"/outlab-consult-runs/details/{detail_id}/return-block")

        assert r.status_code == 200
        assert r.json()["block_returned"] is True

    def test_delete_run(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            "/outlab-consult-runs",
            json={
                "destination_lab": "Reference Lab A",
                "cases": [{"case_type": "surgical", "case_id": case.id}],
            },
        ).json()

        r = pathologist_client.delete(f"/outlab-consult-runs/{created['id']}")

        assert r.status_code == 204
