"""Tests for the daily H&E control-slide workflow (app/crud + app/routers
he_control_slide.py). Router has no RoleChecker — any authenticated user can
reach every endpoint, matching stain_run.py/embedding.py in this same
Histology sidebar section (see test_stain_run_router.py for the analogous
auth regression test)."""

from datetime import date, timedelta

from app.crud import he_control_slide as crud


def _seq(control_no: str) -> int:
    """Trailing -N suffix, or 1 for the bare (first-of-day) form."""
    prefix, _, suffix = control_no.rpartition("-")
    return int(suffix) if prefix.startswith("HECTRL-") and suffix.isdigit() else 1


class TestControlNoSequencing:
    def test_control_no_uses_todays_date_prefix(self, db, admin_user):
        # Real-DB tests share state across the run (see conftest.py docstring),
        # so another test may have already recorded today's slide — assert the
        # date prefix, not that this is necessarily the first row of the day.
        user, _ = admin_user
        slide = crud.create_control_slide(db, performed_by_id=user.id)
        prefix = f"HECTRL-{slide.control_date.strftime('%y%m%d')}"
        assert slide.control_no == prefix or slide.control_no.startswith(f"{prefix}-")

    def test_consecutive_same_day_creates_increment_suffix(self, db, admin_user):
        user, _ = admin_user
        first = crud.create_control_slide(db, performed_by_id=user.id)
        second = crud.create_control_slide(db, performed_by_id=user.id)
        third = crud.create_control_slide(db, performed_by_id=user.id)

        assert _seq(second.control_no) == _seq(first.control_no) + 1
        assert _seq(third.control_no) == _seq(second.control_no) + 1

    def test_different_date_gets_fresh_prefix(self, db, admin_user):
        user, _ = admin_user
        yesterday = date.today() - timedelta(days=1)
        no = crud._get_next_control_no(db, yesterday)
        assert no == f"HECTRL-{yesterday.strftime('%y%m%d')}"


class TestAuth:
    def test_create_requires_authentication(self, client):
        assert client.post("/he-control-slides").status_code == 401

    def test_list_and_print_require_authentication(self, client):
        assert client.get("/he-control-slides").status_code == 401
        assert client.get("/he-control-slides/999999/print-sticker").status_code == 401

    def test_any_authenticated_role_can_reach_endpoints(self, clinician_client):
        assert clinician_client.get("/he-control-slides").status_code == 200
        assert clinician_client.get("/he-control-slides/999999/print-sticker").status_code == 404


class TestCreate:
    def test_creates_record_from_current_user(self, pathologist_client, pathologist_user):
        user, _ = pathologist_user
        r = pathologist_client.post("/he-control-slides")
        assert r.status_code == 200
        body = r.json()
        assert body["performed_by_id"] == user.id
        assert body["control_no"].startswith("HECTRL-")
        assert body["performed_by"]["id"] == user.id


class TestList:
    def test_lists_newest_first(self, pathologist_client):
        first = pathologist_client.post("/he-control-slides").json()
        second = pathologist_client.post("/he-control-slides").json()

        r = pathologist_client.get("/he-control-slides")

        assert r.status_code == 200
        ids = [row["id"] for row in r.json()]
        assert ids.index(second["id"]) < ids.index(first["id"])

    def test_date_range_filter_excludes_out_of_range(self, pathologist_client):
        pathologist_client.post("/he-control-slides")
        future = (date.today() + timedelta(days=30)).isoformat()

        r = pathologist_client.get("/he-control-slides", params={"date_from": future})

        assert r.status_code == 200
        assert r.json() == []


class TestPrintSticker:
    def test_missing_id_returns_404(self, pathologist_client):
        r = pathologist_client.get("/he-control-slides/999999/print-sticker")
        assert r.status_code == 404

    def test_existing_id_returns_pdf(self, pathologist_client):
        created = pathologist_client.post("/he-control-slides").json()

        r = pathologist_client.get(f"/he-control-slides/{created['id']}/print-sticker")

        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
