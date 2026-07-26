"""Background wake-loop for time-based (scheduled) notification rules.

Counterpart to app/his_export/ (the only other in-process background loop in
this codebase — project has no Celery/APScheduler/Redis, see
app/his_export/README.md). Unlike NotificationRule, which fires inline off an
HTTP request handling a state change, ScheduledNotificationRule is evaluated
here at specific times of day rather than on a fixed poll interval. The
check times themselves are read from
SystemSetting.scheduled_notification_times fresh each cycle (not an env var
captured once at import) so an admin's change takes effect on the worker's
next wake-up without a process restart.
"""
