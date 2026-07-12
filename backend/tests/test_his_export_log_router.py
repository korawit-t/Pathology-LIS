"""Router-level tests for app/routers/his_export_log.py: RBAC (admin-only),
filtering, and retry semantics. Rows are inserted directly via the db
fixture rather than through a full case-finalization flow — the trigger
wiring itself is covered separately in test_his_export_trigger_wiring.py."""

import random

from app.models.his_export_log import HisExportLog


def _rid() -> int:
    return random.randint(1_000_000, 999_999_999)


def _make_log(db, **overrides):
    fields = dict(
        resource_type="SurgicalReport",
        resource_id=_rid(),
        accession_no="S26-0001",
        status="dead_letter",
        attempt_count=8,
        max_attempts=8,
    )
    fields.update(overrides)
    row = HisExportLog(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


class TestRbac:
    def test_admin_can_list(self, admin_client):
        assert admin_client.get("/his-export-logs").status_code == 200

    def test_pathologist_cannot_list(self, pathologist_client):
        assert pathologist_client.get("/his-export-logs").status_code == 403

    def test_pathologist_cannot_retry(self, db, pathologist_client):
        row = _make_log(db, accession_no="S26-0002")
        assert pathologist_client.post(f"/his-export-logs/{row.id}/retry").status_code == 403


class TestListAndFilter:
    def test_list_pagination_shape(self, db, admin_client):
        _make_log(db, accession_no="S26-0010")

        r = admin_client.get("/his-export-logs")

        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body

    def test_filter_by_status(self, db, admin_client):
        _make_log(db, accession_no="S26-0011", status="sent")
        dead = _make_log(db, accession_no="S26-0012", status="dead_letter")

        r = admin_client.get("/his-export-logs", params={"status": "dead_letter"})

        assert r.status_code == 200
        items = r.json()["items"]
        assert all(item["status"] == "dead_letter" for item in items)
        assert any(item["id"] == dead.id for item in items)

    def test_filter_by_accession_no(self, db, admin_client):
        _make_log(db, accession_no="S26-UNIQUE-99")

        r = admin_client.get("/his-export-logs", params={"accession_no": "UNIQUE-99"})

        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["accession_no"] == "S26-UNIQUE-99"

    def test_get_by_id(self, db, admin_client):
        row = _make_log(db, accession_no="S26-0014")

        r = admin_client.get(f"/his-export-logs/{row.id}")

        assert r.status_code == 200
        assert r.json()["id"] == row.id

    def test_get_missing_id_returns_404(self, admin_client):
        assert admin_client.get("/his-export-logs/999999").status_code == 404


class TestRetry:
    def test_retry_dead_letter_creates_new_pending_row(self, db, admin_client):
        row = _make_log(db, accession_no="S26-0020", status="dead_letter")

        r = admin_client.post(f"/his-export-logs/{row.id}/retry")

        assert r.status_code == 201
        body = r.json()
        assert body["id"] != row.id
        assert body["status"] == "pending"
        assert body["triggered_by"] == "manual"

    def test_retry_pending_row_returns_400(self, db, admin_client):
        row = _make_log(db, accession_no="S26-0021", status="pending")

        r = admin_client.post(f"/his-export-logs/{row.id}/retry")

        assert r.status_code == 400

    def test_retry_missing_id_returns_404(self, admin_client):
        assert admin_client.post("/his-export-logs/999999/retry").status_code == 404
