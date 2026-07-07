"""Router-level tests for app/routers/audit_log.py. No crud module exists
for this domain (the router queries AuditLog directly) and no test file
covered it before this one — app/services/audit_service.py's listener
(tested in test_audit_service.py) is what actually populates the table;
this file only tests the read/filter/pagination endpoint itself.

Rows are generated for free: creating any tests.conftest `*_user` fixture
is itself a real `User` CREATE tracked by the global listener (see
test_audit_service.py's module docstring), so filtering by
resource_type="User"+resource_id=<that user's id> gives a precisely-scoped,
collision-proof way to assert on this otherwise-unscoped/global endpoint
without a baseline-delta dance."""


class TestRbacAndAuth:
    def test_requires_authentication(self, client):
        assert client.get("/audit-logs").status_code == 401

    def test_any_authenticated_role_can_list(self, clinician_client):
        # Documents current behavior: no role check, only get_current_user.
        assert clinician_client.get("/audit-logs").status_code == 200


class TestFiltering:
    def test_filters_by_resource_type_and_resource_id(self, db, admin_client, admin_user):
        admin, _ = admin_user

        r = admin_client.get("/audit-logs", params={"resource_type": "User", "resource_id": admin.id})

        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 1
        assert all(item["resource_type"] == "User" and item["resource_id"] == admin.id for item in body["items"])

    def test_filters_by_action(self, db, admin_client, admin_user):
        admin, _ = admin_user

        r = admin_client.get(
            "/audit-logs", params={"resource_type": "User", "resource_id": admin.id, "action": "CREATE"}
        )

        assert r.status_code == 200
        assert any(item["action"] == "CREATE" for item in r.json()["items"])

    def test_action_filter_excludes_non_matching(self, db, admin_client, admin_user):
        admin, _ = admin_user

        r = admin_client.get(
            "/audit-logs", params={"resource_type": "User", "resource_id": admin.id, "action": "DELETE"}
        )

        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_unmatched_resource_id_returns_empty(self, admin_client):
        r = admin_client.get("/audit-logs", params={"resource_type": "User", "resource_id": 999999})
        assert r.status_code == 200
        assert r.json() == {"total": 0, "items": []}

    def test_skip_past_the_end_returns_no_items_but_keeps_the_total(self, db, admin_client, admin_user):
        admin, _ = admin_user
        baseline_total = admin_client.get(
            "/audit-logs", params={"resource_type": "User", "resource_id": admin.id}
        ).json()["total"]

        r = admin_client.get(
            "/audit-logs",
            params={"resource_type": "User", "resource_id": admin.id, "skip": baseline_total + 10},
        )

        assert r.status_code == 200
        assert r.json()["total"] == baseline_total
        assert r.json()["items"] == []
