from sqlalchemy import event, inspect
from sqlalchemy.orm import Session
from app.context import current_user_id, current_ip

# Only track these models — add more as needed
TRACKED_MODELS = {
    "SurgicalCase",
    "SurgicalSpecimen",
    "SurgicalDiagnosis",
    "SurgicalBlockStain",
    "SurgicalStainRun",
    "GyneDiagnosis",
    "GyneCytoDiagnosis",
    "NongyneDiagnosis",
    "NongyneCytoDiagnosis",
    "User",
}

# Columns to exclude from snapshots.
# Security: never log credentials.
# Size: skip large free-text fields that bloat the JSON payload — the diff
# for UPDATE already captures only changed columns, so these only matter
# for CREATE/DELETE snapshots.
EXCLUDE_COLUMNS = {
    # credentials — never log
    "password_hash",
    "hashed_password",
    "refresh_token",
    # large free-text report fields
    "gross_description",
    "microscopic_description",
    "final_diagnosis",
    "diagnosis",
    "comment",
    "revision_reason",
    "gross_note",
    "clinical_info",
    # internal timestamps that add noise
    "updated_at",
    "printed_at",
}


def _snapshot(obj) -> dict:
    """Return a JSON-serialisable dict of all mapped column values."""
    state = inspect(obj)
    result = {}
    for col in state.mapper.column_attrs:
        if col.key in EXCLUDE_COLUMNS:
            continue
        val = getattr(obj, col.key, None)
        # Convert non-serialisable types
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        result[col.key] = val
    return result


def _changed_columns(obj) -> tuple[dict, dict]:
    """Return (old_values, new_values) dicts for columns that changed."""
    old, new = {}, {}
    state = inspect(obj)
    column_keys = {col.key for col in state.mapper.column_attrs}
    for attr in state.attrs:
        # Only plain columns are diffed here — relationships (e.g. User.hospitals)
        # hold ORM objects that aren't JSON-serialisable and aren't meaningful
        # as a raw before/after value anyway.
        if attr.key not in column_keys or attr.key in EXCLUDE_COLUMNS:
            continue
        hist = attr.load_history()
        if not hist.has_changes():
            continue
        old_val = hist.deleted[0] if hist.deleted else None
        new_val = hist.added[0] if hist.added else None
        if old_val != new_val:
            if hasattr(old_val, "isoformat"):
                old_val = old_val.isoformat()
            if hasattr(new_val, "isoformat"):
                new_val = new_val.isoformat()
            old[attr.key] = old_val
            new[attr.key] = new_val
    return old, new


def register_audit_listeners():
    from app.models.audit_log import AuditLog

    @event.listens_for(Session, "after_flush")
    def _after_flush(session, flush_context):
        uid = current_user_id.get()
        ip = current_ip.get()
        entries = []

        for obj in list(session.new):
            cls = type(obj).__name__
            if cls not in TRACKED_MODELS:
                continue
            entries.append(AuditLog(
                user_id=uid,
                action="CREATE",
                resource_type=cls,
                resource_id=getattr(obj, "id", None),
                new_values=_snapshot(obj),
                ip_address=ip,
            ))

        for obj in list(session.dirty):
            cls = type(obj).__name__
            if cls not in TRACKED_MODELS:
                continue
            old_vals, new_vals = _changed_columns(obj)
            if old_vals:
                entries.append(AuditLog(
                    user_id=uid,
                    action="UPDATE",
                    resource_type=cls,
                    resource_id=getattr(obj, "id", None),
                    old_values=old_vals,
                    new_values=new_vals,
                    ip_address=ip,
                ))

        for obj in list(session.deleted):
            cls = type(obj).__name__
            if cls not in TRACKED_MODELS:
                continue
            entries.append(AuditLog(
                user_id=uid,
                action="DELETE",
                resource_type=cls,
                resource_id=getattr(obj, "id", None),
                old_values=_snapshot(obj),
                ip_address=ip,
            ))

        for entry in entries:
            session.add(entry)
