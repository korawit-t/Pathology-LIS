from datetime import datetime
from zoneinfo import ZoneInfo

# The one wall clock this app keeps. Every naive DateTime column holds a time on
# it: Python writes local_now(), and app/db/database.py sets each PostgreSQL
# session to the same zone so a column filled by the database's own now()
# agrees with it.
APP_TIMEZONE = "Asia/Bangkok"
_TZ = ZoneInfo(APP_TIMEZONE)


def local_now() -> datetime:
    """Return current datetime in Asia/Bangkok (UTC+7), timezone-naive, consistent with DB columns."""
    return datetime.now(_TZ).replace(tzinfo=None)


def local_timestamp(dt: datetime) -> float:
    """Epoch seconds for a naive Asia/Bangkok datetime as stored by local_now()."""
    return dt.replace(tzinfo=_TZ).timestamp()
