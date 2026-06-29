from datetime import datetime
from zoneinfo import ZoneInfo

_TZ = ZoneInfo("Asia/Bangkok")


def local_now() -> datetime:
    """Return current datetime in Asia/Bangkok (UTC+7), timezone-naive, consistent with DB columns."""
    return datetime.now(_TZ).replace(tzinfo=None)
