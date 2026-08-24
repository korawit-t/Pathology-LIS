"""Router-level tests for app/routers/surgical_specimen_ap_test.py. The
crud layer (app/crud/surgical_specimen_ap_test_service.py) already has
thorough coverage in test_surgical_specimen_ap_test_service.py (case-status
auto-recalculation on add/remove) — this is wiring + the router's actual
auth gate only.

The router is gated at router level by CAN_ACCESS_SURGICAL_SPECIMEN — it
hangs off SurgicalSpecimen and ordering a test here mutates case status, so
the referring side (`clinician`, `hospital`) must not reach it. It was
previously gated only by `Depends(get_current_user)`, the same pattern still
present on external_lab, notification_channel, notification_rule,
stain_panel, diagnostic_templates, gross_templates, and specimen_template in
the Group 3 batch."""

from tests.factories import make_signable_case, make_anatomical_pathology_test


class TestSignedOutCaseNotReopened:
    def test_ordering_ap_test_on_signed_out_case_leaves_status_alone(
        self, db, pathologist_client, admin_user
    ):
        """Ordering an AP test must not resurrect a signed-out case.

        The crud guard used to be a hand-maintained set of statuses that
        belonged to other vocabularies ("published" is cytology's, "completed"
        is a run/item status), so "signed out" was absent and this POST pulled
        a closed, reported case back into the pathologist worklist as
        "pending immuno".
        """
        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id)
        case.status = "signed out"
        db.commit()
        ap_test = make_anatomical_pathology_test(db, category="IHC")

        r = pathologist_client.post(
            "/specimen-ap-tests",
            json={"surgical_specimen_id": specimen.id, "ap_test_id": ap_test.id},
        )

        assert r.status_code == 200
        db.refresh(case)
        assert case.status == "signed out"


class TestCrudWiring:
    def test_clinician_is_forbidden(self, db, clinician_client, admin_user):
        # A referring clinician has no business ordering lab work, and this
        # POST mutates case status. Matches CAN_ACCESS_SURGICAL_SPECIMEN as
        # applied on the surgical_specimen router.
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db, category="IHC")

        created = clinician_client.post(
            "/specimen-ap-tests",
            json={"surgical_specimen_id": specimen.id, "ap_test_id": ap_test.id},
        )
        assert created.status_code == 403
        assert clinician_client.get(f"/specimen-ap-tests/{specimen.id}").status_code == 403

    def test_pathologist_can_add_and_list(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        _, specimen = make_signable_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db, category="IHC")

        created = pathologist_client.post(
            "/specimen-ap-tests",
            json={"surgical_specimen_id": specimen.id, "ap_test_id": ap_test.id},
        )
        assert created.status_code == 200

        r = pathologist_client.get(f"/specimen-ap-tests/{specimen.id}")
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
