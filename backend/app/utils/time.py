from datetime import datetime
from zoneinfo import ZoneInfo

_TZ = ZoneInfo("Asia/Bangkok")


def local_now() -> datetime:
    """Return current datetime in Asia/Bangkok (UTC+7), timezone-naive, consistent with DB columns."""
    return datetime.now(_TZ).replace(tzinfo=None)


def local_timestamp(dt: datetime) -> float:
    """Epoch seconds for a naive Asia/Bangkok datetime as stored by local_now()."""
    return dt.replace(tzinfo=_TZ).timestamp()
