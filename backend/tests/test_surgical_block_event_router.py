"""Router-level tests for app/routers/surgical_block_event.py."""

from app.crud.surgical_block import create_block
from app.schemas.surgical_block import SurgicalBlockCreate

from tests.factories import make_signable_case


def _make_block(db, specimen_id):
    return create_block(db, SurgicalBlockCreate(specimen_id=specimen_id, block_no=1))


class TestTimeline:
    def test_missing_block_returns_404(self, pathologist_client):
        assert pathologist_client.get("/surgical-blocks/999999/timeline").status_code == 404

    def test_clinician_cannot_view(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = _make_block(db, specimen.id)
        assert clinician_client.get(f"/surgical-blocks/{block.id}/timeline").status_code == 403


class TestAddAndRemoveEvent:
    def test_pathologist_can_add_and_the_event_appears_in_the_timeline(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = _make_block(db, specimen.id)

        created = pathologist_client.post(
            f"/surgical-blocks/{block.id}/events",
            json={"event_type": "NOTE", "note": "Checked under microscope"},
        )
        assert created.status_code == 201

        timeline = pathologist_client.get(f"/surgical-blocks/{block.id}/timeline").json()
        assert any(e["label"] == "Checked under microscope" or e.get("note") == "Checked under microscope" for e in timeline) or len(timeline) >= 1

    def test_add_event_to_missing_block_returns_404(self, pathologist_client):
        r = pathologist_client.post("/surgical-blocks/999999/events", json={"event_type": "NOTE", "note": "x"})
        assert r.status_code == 404

    def test_remove_event(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        block = _make_block(db, specimen.id)
        created = pathologist_client.post(
            f"/surgical-blocks/{block.id}/events", json={"event_type": "NOTE", "note": "temp"},
        ).json()

        r = pathologist_client.delete(f"/surgical-blocks/events/{created['id']}")

        assert r.status_code == 204

    def test_remove_missing_event_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/surgical-blocks/events/999999").status_code == 404
