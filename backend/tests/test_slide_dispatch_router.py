"""Router-level tests for app/routers/slide_dispatch.py. The crud layer
(app/crud/slide_dispatch.py) already has thorough coverage in
test_slide_dispatch.py (dispatch-no sequencing, verify-accession guard,
bulk create/delete lifecycle) — this is auth/wiring only.

Every route here is any-authenticated-user (get_current_user only, no role
check). REGRESSION TEST for a real fix: read_dispatches used to not even
require that much (no current_user param, and no router-level
dependencies=[] either) — reachable with zero login. Fixed by adding
`dependencies=[Depends(get_current_user)]` at the router level, matching
its 3 siblings in this file."""

from tests.factories import make_signable_case, make_bare_case


class TestAuth:
    def test_bulk_create_requires_authentication(self, client):
        r = client.post("/slide-dispatches/bulk", json={"items": [], "pathologist_id": 1})
        assert r.status_code == 401

    def test_read_dispatches_requires_authentication(self, client):
        assert client.get("/slide-dispatches").status_code == 401


class TestVerifyAccession:
    def test_not_yet_stained_raises_400(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)

        r = pathologist_client.get(f"/slide-dispatches/verify/{case.accession_no}")

        assert r.status_code == 400

    def test_stained_case_passes(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)
        case.status = "stained"
        db.commit()

        r = pathologist_client.get(f"/slide-dispatches/verify/{case.accession_no}")

        assert r.status_code == 200


class TestBulkCreateAndDelete:
    def test_bulk_create_and_list(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case = make_bare_case(db, registrar_id=registrar.id)

        created = pathologist_client.post(
            "/slide-dispatches/bulk",
            json={
                "items": [{"case_id": case.id, "case_type": "surgical"}],
                "pathologist_id": pathologist.id,
            },
        )
        assert created.status_code == 200
        assert created.json()["total_cases"] == 1

        r = pathologist_client.get("/slide-dispatches")
        assert r.status_code == 200
        assert any(run["id"] == created.json()["id"] for run in r.json()["items"])

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/slide-dispatches/999999").status_code == 404

    def test_delete_existing(self, db, pathologist_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        pathologist, _ = pathologist_user
        case = make_bare_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            "/slide-dispatches/bulk",
            json={"items": [{"case_id": case.id, "case_type": "surgical"}], "pathologist_id": pathologist.id},
        ).json()

        r = pathologist_client.delete(f"/slide-dispatches/{created['id']}")

        assert r.status_code == 204
