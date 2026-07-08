from datetime import datetime, timedelta, time as dtime

from sqlalchemy.orm import Session


def get_holiday_dates(db: Session) -> set:
    """All configured holiday dates, for excluding from TAT elapsed-time math."""
    from app.models.organization import Holiday

    return {row[0] for row in db.query(Holiday.holiday_date).all()}


def business_hours_between(start: datetime, end: datetime, holidays: set) -> float:
    """Elapsed hours between two datetimes, excluding weekends and holidays.

    Mirrors the working-hours loop in frontend/src/utils/tatUtils.ts so the
    reported TAT for completed cases lines up with the SLA progress shown for
    open cases in the worklist.
    """
    if end <= start:
        return 0.0
    total_hours = 0.0
    cur_day = start.date()
    last_day = end.date()
    while cur_day <= last_day:
        if cur_day.weekday() < 5 and cur_day not in holidays:
            day_start = datetime.combine(cur_day, dtime.min)
            day_end = day_start + timedelta(days=1)
            seg_start = max(day_start, start)
            seg_end = min(day_end, end)
            if seg_end > seg_start:
                total_hours += (seg_end - seg_start).total_seconds() / 3600
        cur_day += timedelta(days=1)
    return total_hours


def business_days_between(start: datetime, end: datetime, holidays: set) -> float:
    return business_hours_between(start, end, holidays) / 24
