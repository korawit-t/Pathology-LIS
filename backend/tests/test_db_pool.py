"""A pooled connection the database has dropped is replaced, not handed out.

PostgreSQL restarting (an update, a reboot, the database container restarting
under docker compose) ends every connection the pool is holding. Before
pool_pre_ping, the first request to check out each dead connection failed with
a 500 ("server closed the connection unexpectedly").
"""

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from app.db.database import engine
from app.utils.time import APP_TIMEZONE


def test_a_connection_the_server_ended_is_replaced_on_checkout():
    # An empty pool, so the next checkout is the connection ended below.
    engine.dispose()
    with engine.connect() as conn:
        pid = conn.execute(text("SELECT pg_backend_pid()")).scalar()

    # From outside the pool, the way a server restart would end it. The second
    # argument waits (ms) until the backend has actually gone.
    outsider = create_engine(engine.url, poolclass=NullPool)
    try:
        with outsider.connect() as conn:
            ended = conn.execute(text("SELECT pg_terminate_backend(:pid, 5000)"), {"pid": pid}).scalar()
        assert ended
    finally:
        outsider.dispose()

    with engine.connect() as conn:
        assert conn.execute(text("SELECT pg_backend_pid()")).scalar() != pid
        # The replacement went through the connect hook like any other.
        assert conn.execute(text("SHOW timezone")).scalar() == APP_TIMEZONE
