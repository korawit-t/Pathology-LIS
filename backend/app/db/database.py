import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

from app.utils.time import APP_TIMEZONE

# 1. โหลดค่าจาก .env
load_dotenv()

# 2. อ่านค่า DATABASE_URL
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# (Optional) ดัก Error ถ้าลืมใส่ใน .env
if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("Missing DATABASE_URL in .env file")

# 3. สร้าง Engine
# หมายเหตุ: SQLAlchemy รุ่นใหม่ๆ รองรับ postgresql:// ปกติ
# แต่ถ้าใช้ driver เฉพาะ อาจต้องใช้ postgresql+psycopg2:// ตามใน .env ของคุณ
#
# pool_pre_ping: a pooled connection is tested before it is handed out, and a
# dead one is replaced. Without it, every connection the pool held when
# PostgreSQL restarted (an update, a reboot, the database container restarting)
# was handed to a request as-is, and that request failed with a 500.
engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)


# Every session runs on APP_TIMEZONE. Most DateTime columns are naive and
# default to the database's now(), which a `timestamp without time zone`
# stores in the SESSION's time zone, while Python fills the rest with
# local_now() (Asia/Bangkok). A server left on UTC — the postgres Docker image,
# most managed hosts — therefore put registered_at/created_at 7 hours behind
# every time the app wrote itself, and dated anything registered before 07:00
# to the previous day. Set on each new connection, it holds regardless of the
# server's own setting or a PGTZ in the environment.
@event.listens_for(engine, "connect")
def _set_session_time_zone(dbapi_connection, _connection_record):
    if engine.dialect.name != "postgresql":
        return
    # Outside a transaction, so the pool's rollback-on-return can't undo it.
    autocommit = dbapi_connection.autocommit
    dbapi_connection.autocommit = True
    cursor = dbapi_connection.cursor()
    cursor.execute("SELECT set_config('TimeZone', %s, false)", (APP_TIMEZONE,))
    cursor.close()
    dbapi_connection.autocommit = autocommit


SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()