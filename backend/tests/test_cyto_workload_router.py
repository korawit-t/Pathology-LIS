"""Router-level tests for app/routers/cyto_workload.py. The crud layer
(app/crud/cyto_workload.py) already has thorough business-rule coverage in
test_cyto_workload.py (slide classification, effective-count weighting,
compliance thresholds) — this is auth/wiring only."""


class TestRbacAndAuth:
    def test_requires_authentication(self, client):
        assert client.get("/cyto-workload/stats", params={"start_date": "2026-01-01", "end_date": "2026-01-31"}).status_code == 401

    def test_any_authenticated_role_can_read_stats(self, clinician_client):
        r = clinician_client.get(
            "/cyto-workload/stats", params={"start_date": "2026-01-01", "end_date": "2026-01-31"}
        )
        assert r.status_code == 200


class TestHoursWiring:
    def test_upsert_and_read_back(self, pathologist_client, pathologist_user):
        pathologist, _ = pathologist_user

        created = pathologist_client.post(
            "/cyto-workload/hours",
            json={"user_id": pathologist.id, "work_date": "2026-02-01", "reading_hours": 6.5},
        )
        assert created.status_code == 200
        assert created.json()["reading_hours"] == 6.5

        r = pathologist_client.get(
            "/cyto-workload/hours", params={"user_id": pathologist.id, "work_date": "2026-02-01"}
        )
        assert r.status_code == 200
        assert r.json()["reading_hours"] == 6.5

    def test_get_hours_returns_null_when_absent(self, pathologist_client, pathologist_user):
        pathologist, _ = pathologist_user

        r = pathologist_client.get(
            "/cyto-workload/hours", params={"user_id": pathologist.id, "work_date": "2026-03-15"}
        )

        assert r.status_code == 200
        assert r.json() is None

    def test_negative_reading_hours_rejected(self, pathologist_client, pathologist_user):
        pathologist, _ = pathologist_user

        r = pathologist_client.post(
            "/cyto-workload/hours",
            json={"user_id": pathologist.id, "work_date": "2026-02-01", "reading_hours": -1},
        )

        assert r.status_code == 422
