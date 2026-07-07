"""Router-level tests for app/routers/surgical_specimen_ap_test.py. The
crud layer (app/crud/surgical_specimen_ap_test_service.py) already has
thorough coverage in test_surgical_specimen_ap_test_service.py (case-status
auto-recalculation on add/remove) — this is wiring + the router's actual
auth gate only.

NOTABLE FINDING (documented, not fixed here — see the consolidated
RBAC-consistency report): this router is gated only by
`Depends(get_current_user)` (any authenticated user, no role check),
consistent with the same pattern already found on external_lab,
notification_channel, notification_rule, stain_panel, diagnostic_templates,
gross_templates, and specimen_template in the Group 3 batch."""

from tests.factories import make_signable_case, make_anatomical_pathology_test


class TestCrudWiring:
    def test_clinician_can_add_and_list(self, db, clinician_client, admin_user):
        # Documents current behavior: clinician succeeds here even though it
        # cannot touch surgical specimens via CAN_ACCESS_SURGICAL_SPECIMEN
        # elsewhere in the codebase.
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db, category="IHC")

        created = clinician_client.post(
            "/specimen-ap-tests",
            json={"surgical_specimen_id": specimen.id, "ap_test_id": ap_test.id},
        )
        assert created.status_code == 200

        r = clinician_client.get(f"/specimen-ap-tests/{specimen.id}")
        assert r.status_code == 200
        assert any(item["id"] == created.json()["id"] for item in r.json())

    def test_delete_missing_returns_404(self, pathologist_client):
        assert pathologist_client.delete("/specimen-ap-tests/999999").status_code == 404

    def test_delete_existing(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db, category="IHC")
        created = pathologist_client.post(
            "/specimen-ap-tests",
            json={"surgical_specimen_id": specimen.id, "ap_test_id": ap_test.id},
        ).json()

        r = pathologist_client.delete(f"/specimen-ap-tests/{created['id']}")

        assert r.status_code == 200
        assert r.json()["message"] == "Deleted"


def test_requires_authentication(client):
    assert client.get("/specimen-ap-tests/1").status_code == 401
