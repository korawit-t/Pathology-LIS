"""Router-level tests for app/routers/patients.py. No dedicated router test
existed before this file (only app/crud/patient.py's test_patient.py) —
CAN_ACCESS_PATIENT gates the whole router, with an extra admin/lab_manager-
only restriction stacked specifically on delete."""

from tests.factories import make_patient, make_signable_case


class TestRbac:
    def test_clinician_cannot_list(self, clinician_client):
        # clinician is not in CAN_ACCESS_PATIENT.
        assert clinician_client.get("/patients").status_code == 403

    def test_register_can_list_and_create(self, admin_client):
        # admin bypasses all RoleChecker gates; used here just to prove the
        # endpoint works — RBAC-exclusion is what's interesting (above).
        r = admin_client.post("/patients", json={"name": "Somchai", "ln": "Jaidee"})
        assert r.status_code == 200

    def test_pathologist_cannot_delete_patient(self, db, pathologist_client):
        # CAN_ACCESS_PATIENT includes pathologist, but delete has its own
        # extra RoleChecker(["admin", "lab_manager"]) restriction.
        created = pathologist_client.post("/patients", json={"name": "ToDelete"}).json()

        r = pathologist_client.delete(f"/patients/{created['id']}")

        assert r.status_code == 403

    def test_lab_manager_can_delete_patient(self, lab_manager_client):
        created = lab_manager_client.post("/patients", json={"name": "ToDelete2"}).json()

        r = lab_manager_client.delete(f"/patients/{created['id']}")

        assert r.status_code == 204


class TestCrudWiring:
    def test_get_missing_returns_404(self, pathologist_client):
        assert pathologist_client.get("/patients/999999").status_code == 404

    def test_update_missing_returns_404(self, pathologist_client):
        assert pathologist_client.put("/patients/999999", json={"name": "X"}).status_code == 404

    def test_duplicate_cid_rejected(self, pathologist_client):
        pathologist_client.post("/patients", json={"name": "First", "cid": "1111111111111"})

        r = pathologist_client.post("/patients", json={"name": "Second", "cid": "1111111111111"})

        assert r.status_code == 400

    def test_update_existing(self, pathologist_client):
        created = pathologist_client.post("/patients", json={"name": "Original"}).json()

        r = pathologist_client.put(f"/patients/{created['id']}", json={"name": "Renamed"})

        assert r.status_code == 200
        assert r.json()["name"] == "Renamed"


class TestHistoryEndpoints:
    def test_surgical_history_missing_patient_returns_404(self, pathologist_client):
        assert pathologist_client.get("/patients/999999/history").status_code == 404

    def test_surgical_history_lists_cases(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        patient = make_patient(db)
        case, _ = make_signable_case(db, registrar_id=registrar.id, patient=patient)

        r = pathologist_client.get(f"/patients/{patient.id}/history")

        assert r.status_code == 200
        assert any(c["id"] == case.id for c in r.json())

    def test_gyne_and_nongyne_history_reachable(self, db, pathologist_client):
        patient = make_patient(db)
        assert pathologist_client.get(f"/patients/{patient.id}/gyne-cyto-history").status_code == 200
        assert pathologist_client.get(f"/patients/{patient.id}/nongyne-cyto-history").status_code == 200


def test_requires_authentication(client):
    assert client.get("/patients").status_code == 401
