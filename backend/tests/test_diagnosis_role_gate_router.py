"""Regression tests for a missing-role-gate bug in gyne_diagnosis.py and
nongyne_diagnosis.py: create/update/revise (and, for nongyne, delete) only
required login (router-level Depends(get_current_user)), with no
CAN_WRITE_*_CYTO_REPORT/CAN_MANAGE_SETTINGS check on the individual routes —
unlike the surgical diagnosis equivalent, which gates every write route.
Any authenticated role (e.g. clinician, registrar) could create/edit/delete
a cytology diagnosis, a direct medical-record-integrity risk.
"""

from tests.factories import make_bare_gyne_case, make_bare_nongyne_case


class TestGyneDiagnosisWriteRoleGate:
    def test_clinician_cannot_create_diagnosis(self, clinician_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        response = clinician_client.post("/gyne-diagnosis", json={"case_id": case.id})

        assert response.status_code == 403

    def test_pathologist_can_create_diagnosis(self, pathologist_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)

        response = pathologist_client.post("/gyne-diagnosis", json={"case_id": case.id})

        assert response.status_code == 200

    def test_clinician_cannot_update_diagnosis(self, clinician_client):
        response = clinician_client.put("/gyne-diagnosis/999999", json={"note": "tampered"})

        assert response.status_code == 403

    def test_clinician_cannot_revise_diagnosis(self, clinician_client):
        response = clinician_client.put(
            "/gyne-diagnosis/999999/revise",
            json={"revised_reason": "attacker-supplied reason"},
        )

        assert response.status_code == 403


class TestNongyneDiagnosisWriteRoleGate:
    def test_clinician_cannot_create_diagnosis(self, clinician_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        response = clinician_client.post("/nongyne-diagnosis", json={"case_id": case.id})

        assert response.status_code == 403

    def test_pathologist_can_create_diagnosis(self, pathologist_client, db, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)

        response = pathologist_client.post("/nongyne-diagnosis", json={"case_id": case.id})

        assert response.status_code == 200

    def test_clinician_cannot_update_diagnosis(self, clinician_client):
        response = clinician_client.put(
            "/nongyne-diagnosis/999999", json={"diagnosis": "tampered"}
        )

        assert response.status_code == 403

    def test_clinician_cannot_revise_diagnosis(self, clinician_client):
        response = clinician_client.post(
            "/nongyne-diagnosis/999999/revise",
            json={"revision_reason": "attacker-supplied reason"},
        )

        assert response.status_code == 403

    def test_clinician_cannot_delete_diagnosis(self, clinician_client):
        response = clinician_client.delete("/nongyne-diagnosis/999999")

        assert response.status_code == 403

    def test_admin_can_delete_diagnosis(self, admin_client, db, admin_user):
        from app.crud.nongyne_diagnosis import create_nongyne_diagnosis
        from app.schemas.nongyne_diagnosis import NongyneDiagnosisCreate

        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        diag = create_nongyne_diagnosis(db, obj_in=NongyneDiagnosisCreate(case_id=case.id))

        response = admin_client.delete(f"/nongyne-diagnosis/{diag.id}")

        assert response.status_code == 204
