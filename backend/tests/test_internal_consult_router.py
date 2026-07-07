"""Router-level tests for app/routers/internal_consult.py. The crud layer
(app/crud/internal_consult.py) already has thorough guard-chain coverage in
test_internal_consult.py — this is RBAC (CAN_REQUEST_CONSULT gates create
only; respond/promote/close are any-authenticated-user, but crud enforces
that only the actual assigned consultant/requester may act) + wiring.

respond/close/promote all check the *acting* user's id against
consult.consultant_id/requester_id — so, per feedback_backend_test_patterns
point 8, these tests use exactly one client fixture (pathologist_client) as
the requester for create/close, and a second, distinct identity (admin_user,
who has a known password) for the consultant side via a raw sequential login
on the plain `client` fixture, rather than mixing two named *_client
fixtures (which alias the same TestClient and would silently break the
"who is currently logged in" assumption mid-test)."""

from tests.factories import make_pending_gyne_report


class TestRbac:
    def test_clinician_cannot_create_consult(self, db, clinician_client, admin_user, pathologist_user):
        registrar, _ = admin_user
        consultant, _ = pathologist_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=consultant.id)

        r = clinician_client.post(
            "/internal-consults",
            json={"case_type": "gyne", "report_id": report.id, "consultant_id": consultant.id, "reason": "2nd opinion"},
        )

        assert r.status_code == 403

    def test_pathologist_can_create_consult(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=registrar.id)

        r = pathologist_client.post(
            "/internal-consults",
            json={"case_type": "gyne", "report_id": report.id, "consultant_id": registrar.id, "reason": "2nd opinion"},
        )

        assert r.status_code == 201
        assert r.json()["consultant_id"] == registrar.id


class TestWorkflowWiring:
    def test_my_pending_worklist(self, db, pathologist_client, pathologist_user, admin_user):
        pathologist, _ = pathologist_user
        registrar, _ = admin_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)
        pathologist_client.post(
            "/internal-consults",
            json={"case_type": "gyne", "report_id": report.id, "consultant_id": registrar.id, "reason": "2nd opinion"},
        )

        r = pathologist_client.get("/internal-consults/my-pending")

        assert r.status_code == 200
        # my-pending is scoped to consults where *I* am the consultant —
        # the pathologist_client identity is the requester here, not the
        # consultant (registrar/admin_user), so it should be empty for them.
        assert r.json()["total"] == 0

    def test_get_consults_for_report(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=registrar.id)
        pathologist_client.post(
            "/internal-consults",
            json={"case_type": "gyne", "report_id": report.id, "consultant_id": registrar.id, "reason": "2nd opinion"},
        )

        r = pathologist_client.get(f"/internal-consults/report/gyne/{report.id}")

        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_respond_then_close_lifecycle(self, db, client, pathologist_client, pathologist_user, admin_user):
        """pathologist_client (requester) creates + later closes; admin_user
        (consultant) responds via a separate sequential login on the plain
        `client` fixture. `pathologist_client` and `client` are the SAME
        underlying TestClient (see module docstring), so re-logging in as
        admin mid-test also flips `pathologist_client`'s active identity —
        must log back in as the pathologist before the close call."""
        pathologist, pathologist_pw = pathologist_user
        registrar, admin_pw = admin_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=registrar.id)

        created = pathologist_client.post(
            "/internal-consults",
            json={"case_type": "gyne", "report_id": report.id, "consultant_id": registrar.id, "reason": "2nd opinion"},
        ).json()

        login = client.post("/auth/login", data={"username": registrar.username, "password": admin_pw})
        assert login.status_code == 200
        responded = client.patch(f"/internal-consults/{created['id']}/respond", json={"opinion": "Agree"})
        assert responded.status_code == 200
        assert responded.json()["status"] == "responded"

        relogin = client.post("/auth/login", data={"username": pathologist.username, "password": pathologist_pw})
        assert relogin.status_code == 200
        closed = pathologist_client.patch(f"/internal-consults/{created['id']}/close")
        assert closed.status_code == 200
        assert closed.json()["status"] == "closed"

    def test_respond_by_someone_other_than_the_consultant_is_rejected(self, db, client, pathologist_client, pathologist_user, admin_user, clinician_user):
        # Uses only ONE named *_client fixture (pathologist_client) plus a
        # manual sequential login on the plain `client` fixture for the
        # second identity — see module docstring on why not two *_client
        # fixtures in the same test.
        pathologist, _ = pathologist_user
        registrar, _ = admin_user
        clinician, clinician_pw = clinician_user
        _, report = make_pending_gyne_report(db, registrar_id=registrar.id, pathologist_id=pathologist.id)
        created = pathologist_client.post(
            "/internal-consults",
            json={"case_type": "gyne", "report_id": report.id, "consultant_id": registrar.id, "reason": "2nd opinion"},
        ).json()

        login = client.post("/auth/login", data={"username": clinician.username, "password": clinician_pw})
        assert login.status_code == 200
        r = client.patch(f"/internal-consults/{created['id']}/respond", json={"opinion": "Not me"})

        assert r.status_code == 403


def test_requires_authentication(client):
    assert client.get("/internal-consults/my-pending").status_code == 401
