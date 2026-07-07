"""Router-level tests for app/routers/his.py.

This developer's local backend/.env has a real HIS_DATABASE_URL configured
(pointing at an actual HOSxP MySQL host), so is_his_configured() and
get_his_db() are NOT reliably "unconfigured" here the way they would be in
a clean CI environment — the router's own module-level
`is_his_configured`/`get_his_db` are references into app.db.his_database,
which computes HIS_DATABASE_URL/_HisSessionLocal at import time from the
environment. Force the "not configured" state deterministically via
monkeypatch rather than depending on whatever happens to be in .env."""

import app.db.his_database as his_database_module


def _force_not_configured(monkeypatch):
    monkeypatch.setattr(his_database_module, "HIS_DATABASE_URL", None)
    monkeypatch.setattr(his_database_module, "_HisSessionLocal", None)


class _FakeHisSession:
    """Stand-in for a real HIS DB session — only close() is ever called on
    it by get_his_db()'s cleanup; tests using this never reach a real query
    because they're only exercising guards that run before any query."""

    def close(self):
        pass


def _force_configured(monkeypatch):
    # is_his_configured() only checks the URL string; get_his_db() separately
    # checks _HisSessionLocal is None. Both must be patched together, or the
    # request 503s on the his_db-is-None guard before ever reaching the
    # guard/logic under test — which is exactly what happened in CI (no real
    # HIS_DATABASE_URL there), even though HIS_DATABASE_URL alone was patched.
    monkeypatch.setattr(his_database_module, "HIS_DATABASE_URL", "mysql+pymysql://fake/db")
    monkeypatch.setattr(his_database_module, "_HisSessionLocal", lambda: _FakeHisSession())


class TestAuth:
    def test_requires_authentication(self, client):
        assert client.get("/his/patients", params={"hn": "12345"}).status_code == 401

    def test_any_authenticated_role_can_query(self, clinician_client, monkeypatch):
        _force_not_configured(monkeypatch)
        # Not configured in this test -> 503, but that proves it got past auth.
        assert clinician_client.get("/his/patients", params={"hn": "12345"}).status_code == 503


class TestNotConfiguredGuards:
    def test_search_patients_503_when_not_configured(self, pathologist_client, monkeypatch):
        _force_not_configured(monkeypatch)
        r = pathologist_client.get("/his/patients", params={"hn": "12345"})
        assert r.status_code == 503

    def test_search_patients_requires_hn_or_date_range_once_configured(self, pathologist_client, monkeypatch):
        # Simulate "configured" without a real connection, so this reaches
        # the hn/date-range 400 guard without needing a real HIS database.
        _force_configured(monkeypatch)
        r = pathologist_client.get("/his/patients")
        assert r.status_code == 400

    def test_appointments_503_when_not_configured(self, pathologist_client, monkeypatch):
        _force_not_configured(monkeypatch)
        r = pathologist_client.get("/his/appointments", params={"hn": "12345"})
        assert r.status_code == 503

    def test_info_reports_not_configured(self, pathologist_client, monkeypatch):
        _force_not_configured(monkeypatch)
        r = pathologist_client.get("/his/info")
        assert r.status_code == 200
        assert r.json()["configured"] is False
