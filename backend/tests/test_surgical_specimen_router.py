"""Router-level tests for app/routers/surgical_specimen.py. Real
router-only logic worth covering: the "cannot delete a specimen from an
already-reported case" guard, and the additional-sections flag toggle."""

from tests.factories import make_signable_case


class TestRbac:
    def test_clinician_cannot_read(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        assert clinician_client.get(f"/surgical-specimens/{specimen.id}").status_code == 403

    def test_pathologist_can_read(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        assert pathologist_client.get(f"/surgical-specimens/{specimen.id}").status_code == 200


class TestCrudWiring:
    def test_create_and_update_gross(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, _ = make_signable_case(db, registrar_id=registrar.id)

        created = pathologist_client.post(
            "/surgical-specimens",
            json={"surgical_case_id": case.id, "specimen_label": "B", "specimen_name": "Second specimen"},
        ).json()

        updated = pathologist_client.patch(
            f"/surgical-specimens/{created['id']}/gross",
            json={"gross_description": "Grossly unremarkable"},
        )
        assert updated.status_code == 200
        assert updated.json()["gross_description"] == "Grossly unremarkable"

    def test_gross_draft_does_not_change_case_status(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        status_before = case.status

        r = pathologist_client.patch(
            f"/surgical-specimens/{specimen.id}/gross/draft",
            json={"gross_description": "Draft text"},
        )

        assert r.status_code == 200
        db.refresh(case)
        assert case.status == status_before

    def test_read_missing_returns_404(self, pathologist_client):
        assert pathologist_client.get("/surgical-specimens/999999").status_code == 404


class TestDelete:
    def test_cannot_delete_a_specimen_from_a_reported_case(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_reported = True
        db.commit()

        r = pathologist_client.delete(f"/surgical-specimens/{specimen.id}")

        assert r.status_code == 400

    def test_can_delete_when_not_reported(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.is_reported = False
        db.commit()

        r = pathologist_client.delete(f"/surgical-specimens/{specimen.id}")

        assert r.status_code == 204

    def test_clinician_cannot_delete(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        r = clinician_client.delete(f"/surgical-specimens/{specimen.id}")
        assert r.status_code == 403


class TestAdditionalSections:
    def test_flagging_and_clearing(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)

        flagged = pathologist_client.patch(
            f"/surgical-specimens/{specimen.id}/additional-sections",
            json={"needs": True, "note": "Need deeper levels"},
        )
        assert flagged.status_code == 200
        assert flagged.json()["needs_additional_sections"] is True

        cleared = pathologist_client.patch(
            f"/surgical-specimens/{specimen.id}/additional-sections",
            json={"needs": False},
        )
        assert cleared.json()["needs_additional_sections"] is False

    def test_lists_specimens_flagged_for_additional_sections(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        pathologist_client.patch(f"/surgical-specimens/{specimen.id}/additional-sections", json={"needs": True})

        r = pathologist_client.get("/surgical-specimens/additional-sections")

        assert r.status_code == 200
        assert any(s["id"] == specimen.id for s in r.json())


def test_requires_authentication(client):
    assert client.get("/surgical-specimens/1").status_code == 401
