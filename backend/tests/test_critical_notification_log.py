"""Tests for app/crud/critical_notification_log.py. Worth covering:
update_recipient's None-means-"don't touch" partial update (it's a manual
if-not-None check, not model_dump(exclude_unset=True), so worth confirming
it behaves the same way), get_by_case's case_id+case_type scoping, and
get_all's total-count-vs-paginated-items split."""

from datetime import datetime

from app.crud.critical_notification_log import create, update_recipient, get_by_case, get_all
from app.schemas.critical_notification_log import CriticalNotificationLogCreate, CriticalNotificationLogUpdate

from tests.factories import make_bare_case


def _log_in(case_id: int, case_type: str = "SURGICAL", **overrides) -> CriticalNotificationLogCreate:
    fields = dict(notification_type="critical_value", notified_at=datetime.utcnow())
    fields.update(overrides)
    return CriticalNotificationLogCreate(case_id=case_id, case_type=case_type, **fields)


class TestCreate:
    def test_persists_channel_names_and_notifier(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)

        result = create(
            db, _log_in(case.id, recipient_name="Dr. Somchai"),
            notified_by_id=registrar.id, notified_channel_names=["LINE Notify"],
        )

        assert result.recipient_name == "Dr. Somchai"
        assert result.notified_channel_names == ["LINE Notify"]
        assert result.notified_by_id == registrar.id


class TestUpdateRecipient:
    def test_updates_only_the_field_that_is_not_none(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        log = create(db, _log_in(case.id, recipient_name="Original", recipient_role="Nurse"))

        result = update_recipient(db, log.id, CriticalNotificationLogUpdate(recipient_name="Updated"))

        assert result.recipient_name == "Updated"
        assert result.recipient_role == "Nurse"  # untouched, since it was None on the update payload

    def test_missing_id_returns_none(self, db):
        assert update_recipient(db, 999999, CriticalNotificationLogUpdate(recipient_name="x")) is None


class TestGetByCase:
    def test_scopes_to_case_id_and_case_type(self, db, admin_user):
        registrar, _ = admin_user
        case_a = make_bare_case(db, registrar_id=registrar.id)
        case_b = make_bare_case(db, registrar_id=registrar.id)
        create(db, _log_in(case_a.id, case_type="SURGICAL"))
        create(db, _log_in(case_b.id, case_type="SURGICAL"))

        result = get_by_case(db, case_a.id, "SURGICAL")

        assert result["total"] == 1
        assert result["items"][0].case_id == case_a.id


class TestGetAll:
    def test_total_reflects_the_full_filtered_count_not_just_the_page(self, db, admin_user):
        # get_all with no filters counts every row ever committed in this
        # test run (a real, shared Postgres DB) — so assert on the delta
        # this test itself adds, not an absolute count.
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        baseline = get_all(db, limit=1)["total"]
        for _ in range(3):
            create(db, _log_in(case.id))

        page = get_all(db, skip=0, limit=1)

        assert page["total"] == baseline + 3
        assert len(page["items"]) == 1

    def test_filters_by_notification_type(self, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        create(db, _log_in(case.id, notification_type="critical_value"))
        marker = create(db, _log_in(case.id, notification_type=f"malignancy_{case.id}"))

        result = get_all(db, notification_type=f"malignancy_{case.id}")

        assert result["total"] == 1
        assert result["items"][0].id == marker.id
