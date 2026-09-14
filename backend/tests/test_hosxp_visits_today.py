"""Regression tests for hosxp.get_hns_with_visit_today's query shape.

The original query was `SELECT hn FROM vn_stat WHERE DATE(vstdate) =
CURRENT_DATE`. DATE(vstdate) is non-sargable, so MySQL scanned all ~5.1M
rows of vn_stat (row count measured on the live HOSxP — see
test_hosxp_vn_an_split.py) four times a day, and the scheduled_notifications
worker's run died with pymysql 2013 "Lost connection to MySQL server during
query".

There's no MySQL in the test environment, so these assert on the SQL and
bound params handed to the session rather than on query results — the point
of the fix is the shape of the statement, not what it returns.
"""

from datetime import date, datetime

import pytest

import app.his_adapters.hosxp as hosxp


class _RecordingHisSession:
    """Captures the statement/params instead of executing them. `rows` is
    what the fake .fetchall() hands back."""

    def __init__(self, rows=None):
        self.rows = rows or []
        self.statements = []

    def execute(self, statement, params=None):
        self.statements.append((str(statement), params or {}))
        session = self

        class _Result:
            def fetchall(self):
                return session.rows

        return _Result()

    @property
    def sql(self) -> str:
        assert len(self.statements) == 1, f"expected one query, got {len(self.statements)}"
        return self.statements[0][0]

    @property
    def params(self) -> dict:
        assert len(self.statements) == 1, f"expected one query, got {len(self.statements)}"
        return self.statements[0][1]


@pytest.fixture
def frozen_today(monkeypatch):
    monkeypatch.setattr(hosxp, "local_now", lambda: datetime(2026, 9, 4, 13, 0, 0))
    return date(2026, 9, 4)


class TestDatePredicate:
    def test_does_not_wrap_vstdate_in_a_function(self, frozen_today):
        """DATE(vstdate) is what made this a full table scan."""
        his_db = _RecordingHisSession()
        hosxp.get_hns_with_visit_today(his_db)
        assert "DATE(vstdate)" not in his_db.sql
        assert "vstdate >= :today" in his_db.sql
        assert "vstdate < :tomorrow" in his_db.sql

    def test_binds_a_half_open_day_range_from_the_app_clock(self, frozen_today):
        """Bound from local_now() (Asia/Bangkok), not the MySQL server's
        CURRENT_DATE, so both sides agree on which day "today" is."""
        his_db = _RecordingHisSession()
        hosxp.get_hns_with_visit_today(his_db)
        assert his_db.params["today"] == date(2026, 9, 4)
        assert his_db.params["tomorrow"] == date(2026, 9, 5)
        assert "CURRENT_DATE" not in his_db.sql


class TestHnFilter:
    def test_omitted_by_default_for_the_visits_today_endpoint(self, frozen_today):
        his_db = _RecordingHisSession()
        hosxp.get_hns_with_visit_today(his_db)
        assert "hn IN" not in his_db.sql
        assert "hns" not in his_db.params

    def test_pushed_into_sql_when_the_caller_has_candidates(self, frozen_today):
        his_db = _RecordingHisSession()
        hosxp.get_hns_with_visit_today(his_db, hns=["0086209", "0086210"])
        assert "hn IN" in his_db.sql
        assert his_db.params["hns"] == ["0086209", "0086210"]

    def test_hns_are_bound_not_interpolated(self, frozen_today):
        his_db = _RecordingHisSession()
        hosxp.get_hns_with_visit_today(his_db, hns=["0086209"])
        assert "0086209" not in his_db.sql

    def test_empty_candidate_list_skips_the_query_entirely(self, frozen_today):
        """A worker cycle with nothing pending must not touch HOSxP at all;
        an empty IN () list would also be invalid SQL."""
        his_db = _RecordingHisSession()
        assert hosxp.get_hns_with_visit_today(his_db, hns=[]) == []
        assert his_db.statements == []


class TestResult:
    def test_returns_hns_and_drops_nulls(self, frozen_today):
        his_db = _RecordingHisSession(rows=[("0086209",), (None,), ("0086210",)])
        assert hosxp.get_hns_with_visit_today(his_db) == ["0086209", "0086210"]
