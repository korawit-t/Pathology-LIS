"""Which HIS is connected, and what it can do.

GET /his/info reports a display name and per-feature flags so the frontend
can label the HIS button with the program the hospital actually uses and
hide controls the connected HIS can't serve. The HOSxP-only lookups
(appointments, visits today, current admission) go through the adapter, so a
non-HOSxP site gets "not supported" instead of HOSxP SQL run against another
vendor's database.

HIS_TYPE / HIS_DISPLAY_NAME are read from the environment at import time and
this developer's local .env sets a real HIS, so every test pins the state it
needs via monkeypatch rather than relying on the environment."""

import logging
from unittest.mock import MagicMock, patch

import pytest

import app.db.his_database as his_database_module
import app.his_adapters as his_adapters
import app.his_adapters.custom as custom_module
import app.scheduled_notifications.worker as worker
from app.his_adapters import HisFeature, get_his_adapter_or_none
from app.services.notification_service import build_his_patient_context


class _FakeHisSession:
    def __init__(self):
        self.closed = False

    def execute(self, *args, **kwargs):
        raise AssertionError("this test must not reach a HIS query")

    def close(self):
        self.closed = True


def _connect(monkeypatch, his_type="hosxp", display_name=""):
    monkeypatch.setattr(his_adapters, "HIS_TYPE", his_type)
    monkeypatch.setattr(his_adapters, "HIS_DISPLAY_NAME", display_name)
    monkeypatch.setattr(his_database_module, "HIS_DATABASE_URL", "mysql+pymysql://fake/db")
    monkeypatch.setattr(his_database_module, "_HisSessionLocal", lambda: _FakeHisSession())


def _disconnect(monkeypatch, his_type="hosxp"):
    monkeypatch.setattr(his_adapters, "HIS_TYPE", his_type)
    monkeypatch.setattr(his_adapters, "HIS_DISPLAY_NAME", "")
    monkeypatch.setattr(his_database_module, "HIS_DATABASE_URL", None)
    monkeypatch.setattr(his_database_module, "_HisSessionLocal", None)


@pytest.fixture
def sql_dir(tmp_path, monkeypatch):
    """An empty custom-SQL data dir; tests drop .sql files into it."""
    monkeypatch.setattr(custom_module, "_DATA_DIR", str(tmp_path))
    return tmp_path


class TestHisInfo:
    def test_not_configured_reports_every_feature_off(self, pathologist_client, monkeypatch):
        _disconnect(monkeypatch)
        body = pathologist_client.get("/his/info").json()
        assert body["configured"] is False
        assert body["display_name"] == "HOSxP"
        assert set(body["features"]) == {"patient_search", "appointments", "visits_today", "admission"}
        assert not any(body["features"].values())

    def test_hosxp_reports_name_and_all_features(self, pathologist_client, monkeypatch):
        _connect(monkeypatch, "hosxp")
        body = pathologist_client.get("/his/info").json()
        assert body == {
            "configured": True,
            "his_type": "hosxp",
            "display_name": "HOSxP",
            "features": {
                "patient_search": True,
                "appointments": True,
                "visits_today": True,
                "admission": True,
            },
        }

    def test_display_name_override(self, pathologist_client, monkeypatch, sql_dir):
        (sql_dir / "his_surgical.sql").write_text("SELECT 1")
        _connect(monkeypatch, "custom", display_name="SSB")
        body = pathologist_client.get("/his/info").json()
        assert body["his_type"] == "custom"
        assert body["display_name"] == "SSB"

    def test_custom_without_display_name_is_generic_not_custom_sql(self, pathologist_client, monkeypatch, sql_dir):
        (sql_dir / "his_surgical.sql").write_text("SELECT 1")
        _connect(monkeypatch, "custom")
        assert pathologist_client.get("/his/info").json()["display_name"] == "HIS"

    def test_custom_offers_patient_search_only(self, pathologist_client, monkeypatch, sql_dir):
        (sql_dir / "his_custom_query.sql").write_text("SELECT 1")
        _connect(monkeypatch, "custom")
        assert pathologist_client.get("/his/info").json()["features"] == {
            "patient_search": True,
            "appointments": False,
            "visits_today": False,
            "admission": False,
        }

    def test_custom_without_any_sql_file_has_no_patient_search(self, pathologist_client, monkeypatch, sql_dir):
        _connect(monkeypatch, "custom")
        body = pathologist_client.get("/his/info").json()
        assert body["configured"] is True
        assert body["features"]["patient_search"] is False

    def test_unknown_his_type_is_not_configured(self, pathologist_client, monkeypatch):
        _connect(monkeypatch, "nosuchhis")
        body = pathologist_client.get("/his/info").json()
        assert body["configured"] is False
        assert body["his_type"] == "nosuchhis"
        assert not any(body["features"].values())

    def test_retired_ssb_type_does_not_500(self, pathologist_client, monkeypatch):
        _connect(monkeypatch, "ssb")
        r = pathologist_client.get("/his/info")
        assert r.status_code == 200
        assert r.json()["configured"] is False


class TestUnsupportedFeatureEndpoints:
    def test_appointments_501_on_custom(self, pathologist_client, monkeypatch, sql_dir):
        _connect(monkeypatch, "custom", display_name="SSB")
        r = pathologist_client.get("/his/appointments", params={"hn": "12345"})
        assert r.status_code == 501
        assert "SSB" in r.json()["detail"]

    def test_visits_today_501_on_custom(self, pathologist_client, monkeypatch, sql_dir):
        _connect(monkeypatch, "custom")
        assert pathologist_client.get("/his/visits-today").status_code == 501

    def test_patient_search_501_on_custom_without_sql(self, pathologist_client, monkeypatch, sql_dir):
        _connect(monkeypatch, "custom")
        r = pathologist_client.get("/his/patients", params={"hn": "12345"})
        assert r.status_code == 501

    def test_visits_today_still_503_when_not_configured(self, pathologist_client, monkeypatch):
        _disconnect(monkeypatch)
        assert pathologist_client.get("/his/visits-today").status_code == 503


class TestNotificationEnrichment:
    def test_custom_his_skips_lookup_without_opening_a_session(self, monkeypatch, sql_dir):
        _connect(monkeypatch, "custom")
        with patch("app.db.his_database.get_his_session_direct") as opened:
            assert build_his_patient_context("0376632") == ("", "")
        opened.assert_not_called()

    def test_unknown_his_type_skips_lookup(self, monkeypatch):
        _connect(monkeypatch, "nosuchhis")
        with patch("app.db.his_database.get_his_session_direct") as opened:
            assert build_his_patient_context("0376632") == ("", "")
        opened.assert_not_called()


class TestWorkerVisitingHns:
    def test_custom_his_returns_nobody_without_opening_a_session(self, monkeypatch, sql_dir):
        _connect(monkeypatch, "custom")
        opened = MagicMock()
        monkeypatch.setattr(worker, "get_his_session_direct", opened)
        assert worker._load_visiting_hns(["0086209"]) == set()
        opened.assert_not_called()

    def test_hosxp_asks_the_adapter_and_closes_the_session(self, monkeypatch):
        _connect(monkeypatch, "hosxp")
        session = _FakeHisSession()
        monkeypatch.setattr(worker, "get_his_session_direct", lambda: session)
        with patch("app.his_adapters.hosxp.get_hns_with_visit_today", return_value=["0086209"]) as q:
            assert worker._load_visiting_hns(["0086209", "0086210"]) == {"0086209"}
        q.assert_called_once_with(session, hns=["0086209", "0086210"])
        assert session.closed is True


class TestAdapterResolution:
    @pytest.mark.parametrize("his_type", ["ssb", "nosuchhis"])
    def test_no_working_adapter_resolves_to_none(self, monkeypatch, his_type):
        monkeypatch.setattr(his_adapters, "HIS_TYPE", his_type)
        assert get_his_adapter_or_none() is None

    def test_base_adapter_refuses_optional_features(self, monkeypatch, sql_dir):
        monkeypatch.setattr(his_adapters, "HIS_TYPE", "custom")
        adapter = get_his_adapter_or_none()
        assert not adapter.supports(HisFeature.APPOINTMENTS)
        with pytest.raises(his_adapters.HisFeatureNotSupported):
            adapter.get_appointments(None, "1")


class TestSessionFactory:
    @pytest.mark.parametrize("url", [None, "", "   "])
    def test_blank_url_means_no_his(self, url):
        assert his_database_module._build_session_factory(url) is None

    def test_unusable_url_disables_his_without_crashing_or_leaking_it(self, caplog):
        url = "mysql+nosuchdriver://lisuser:s3cr3t-pw@10.0.0.1/hos"
        with caplog.at_level(logging.WARNING, logger="app.db.his_database"):
            assert his_database_module._build_session_factory(url) is None
        assert "mysql+nosuchdriver" in caplog.text
        assert "s3cr3t-pw" not in caplog.text

    def test_any_sqlalchemy_url_is_accepted_not_just_three_prefixes(self, tmp_path):
        # The old prefix allowlist was mysql/postgresql/sqlite only; what
        # matters now is whether SQLAlchemy can build an engine for it.
        factory = his_database_module._build_session_factory(f"sqlite:///{tmp_path / 'his.db'}")
        assert factory is not None

    def test_configured_follows_the_session_factory_not_the_url(self, monkeypatch):
        monkeypatch.setattr(his_database_module, "HIS_DATABASE_URL", "mssql+pyodbc://x/y")
        monkeypatch.setattr(his_database_module, "_HisSessionLocal", None)
        assert his_database_module.is_his_configured() is False
