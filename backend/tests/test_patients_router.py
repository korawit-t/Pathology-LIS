"""Router-level tests for app/routers/patients.py. No dedicated router test
existed before this file (only app/crud/patient.py's test_patient.py) —
CAN_ACCESS_PATIENT gates the whole router, with an extra admin/lab_manager-
only restriction stacked specifically on delete."""

import uuid

from tests.factories import make_bare_gyne_case, make_hospital, make_patient, make_signable_case


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


class TestPatientPage:
    def test_returns_items_and_total_with_hn(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        unique = uuid.uuid4().hex[:8]
        hospital = make_hospital(db)
        patient = make_patient(db, name=f"Paged-{unique}")
        case = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hospital, patient=patient)
        case.hn = f"HN{unique}"
        db.commit()

        r = pathologist_client.get("/patients/page", params={"q": f"HN{unique}"})

        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 1
        assert body["items"][0]["id"] == patient.id
        assert body["items"][0]["hn"] == f"{hospital.name}: HN{unique}"

    def test_page_is_not_read_as_a_patient_id(self, pathologist_client):
        # /page is declared before /{patient_id}; otherwise this is a 422.
        assert pathologist_client.get("/patients/page").status_code == 200

    def test_limit_is_capped(self, pathologist_client):
        assert pathologist_client.get("/patients/page", params={"limit": 101}).status_code == 422

    def test_clinician_cannot_page(self, clinician_client):
        assert clinician_client.get("/patients/page").status_code == 403


class TestDeleteGuard:
    def test_patient_with_cases_is_refused_with_409(self, db, lab_manager_client, admin_user):
        registrar, _ = admin_user
        patient = make_patient(db)
        make_bare_gyne_case(db, registrar_id=registrar.id, patient=patient)

        r = lab_manager_client.delete(f"/patients/{patient.id}")

        assert r.status_code == 409
        assert "Gyne 1" in r.json()["detail"]
        assert lab_manager_client.get(f"/patients/{patient.id}").status_code == 200


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
