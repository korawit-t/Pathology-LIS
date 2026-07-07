"""Tests for app/services/audit_service.py. The listener is registered once,
globally, at app startup (see main.py) — by the time any test runs, it's
already active on every Session (including the `db` fixture's), so these
tests exercise it by performing real CREATE/UPDATE/DELETE on TRACKED_MODELS
instances and checking the resulting AuditLog rows, rather than calling
register_audit_listeners() again (which would double-register it)."""

import uuid

from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.organization import Hospital
from app.context import current_user_id, current_ip


def _make_tracked_user(db, **overrides) -> User:
    fields = dict(
        username=f"audit_{uuid.uuid4().hex[:8]}",
        hashed_password="hashed-secret-value",
        full_name="Audit Test User",
        roles=["clinician"],
        status=True,
        is_temporary_password=False,
    )
    fields.update(overrides)
    user = User(**fields)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _logs_for(db, resource_type: str, resource_id: int):
    return (
        db.query(AuditLog)
        .filter(AuditLog.resource_type == resource_type, AuditLog.resource_id == resource_id)
        .all()
    )


class TestCreateTracking:
    def test_logs_a_create_entry_with_the_current_user_and_ip(self, db, admin_user):
        # user_id is a real FK to users.id, so the "acting" user in the
        # context var must be a real, already-committed user.
        actor, _ = admin_user
        token_user = current_user_id.set(actor.id)
        token_ip = current_ip.set("10.0.0.5")
        try:
            user = _make_tracked_user(db)
        finally:
            current_user_id.reset(token_user)
            current_ip.reset(token_ip)

        logs = _logs_for(db, "User", user.id)
        assert len(logs) == 1
        assert logs[0].action == "CREATE"
        assert logs[0].user_id == actor.id
        assert logs[0].ip_address == "10.0.0.5"
        assert logs[0].new_values["username"] == user.username

    def test_excludes_sensitive_columns_from_the_snapshot(self, db):
        user = _make_tracked_user(db)

        logs = _logs_for(db, "User", user.id)
        assert "hashed_password" not in logs[0].new_values

    def test_does_not_log_untracked_models(self, db):
        hospital = Hospital(name=f"Untracked Hospital {uuid.uuid4().hex[:6]}", code=f"H{uuid.uuid4().hex[:6]}")
        db.add(hospital)
        db.commit()
        db.refresh(hospital)

        assert _logs_for(db, "Hospital", hospital.id) == []


class TestUpdateTracking:
    def test_logs_only_the_changed_columns(self, db):
        user = _make_tracked_user(db, full_name="Original Name")

        user.full_name = "Updated Name"
        db.commit()

        logs = [l for l in _logs_for(db, "User", user.id) if l.action == "UPDATE"]
        assert len(logs) == 1
        assert logs[0].old_values == {"full_name": "Original Name"}
        assert logs[0].new_values == {"full_name": "Updated Name"}

    def test_changing_a_sensitive_column_produces_no_update_entry(self, db):
        user = _make_tracked_user(db)

        user.hashed_password = "a-new-hash"
        db.commit()

        logs = [l for l in _logs_for(db, "User", user.id) if l.action == "UPDATE"]
        assert logs == []

    def test_no_op_commit_does_not_log_an_update(self, db):
        user = _make_tracked_user(db)
        before = len([l for l in _logs_for(db, "User", user.id) if l.action == "UPDATE"])

        db.commit()  # nothing changed

        after = len([l for l in _logs_for(db, "User", user.id) if l.action == "UPDATE"])
        assert after == before


class TestDeleteTracking:
    def test_logs_a_delete_entry_with_a_snapshot_of_the_deleted_row(self, db):
        user = _make_tracked_user(db, full_name="To Be Deleted")
        user_id = user.id

        db.delete(user)
        db.commit()

        logs = [l for l in _logs_for(db, "User", user_id) if l.action == "DELETE"]
        assert len(logs) == 1
        assert logs[0].old_values["full_name"] == "To Be Deleted"
        assert "hashed_password" not in logs[0].old_values
