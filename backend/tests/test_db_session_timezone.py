"""The app's database sessions run on the same wall clock as local_now().

Most DateTime columns are naive and default to the database's now(), which
PostgreSQL stores in the session's time zone. On a server left on UTC (the
postgres Docker image, CI's service container) those columns used to land
7 hours behind every time Python wrote with local_now().
"""

from datetime import timedelta

from sqlalchemy import text

from app.db.database import engine
from app.utils.time import APP_TIMEZONE, local_now


def test_session_time_zone_is_the_app_time_zone():
    with engine.connect() as conn:
        assert conn.execute(text("SHOW timezone")).scalar() == APP_TIMEZONE


def test_database_now_matches_local_now_for_naive_columns():
    with engine.connect() as conn:
        db_now = conn.execute(text("SELECT now()::timestamp")).scalar()
    assert abs(db_now - local_now()) < timedelta(minutes=1)
