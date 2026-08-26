"""Router-level tests for app/routers/outlab_consult.py. The crud layer
(app/crud/outlab_consult.py) already has thorough lifecycle coverage in
test_outlab_consult.py — this is auth/wiring only.

NOTABLE FINDING (documented, not fixed — see the consolidated RBAC report):
every route here is gated only by get_current_user (any authenticated
user, no role check), same pattern as slide_block_release/slide_dispatch
in this same group."""

import uuid

from tests.factories import make_bare_case


class TestAuth:
    def test_requires_authentication(self, client):
        assert client.get("/outlab-consult-runs").status_code == 401

    def test_any_authenticated_role_can_create_and_list(self, db, clinician_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)

        created = clinician_client.post(
            "/outlab-consult-runs",
            json={
                "destination_lab": "Reference Lab A",
                "cases": [{"case_type": "surgical", "case_id": case.id, "accession_no": case.accession_no}],
            },
        )
        assert created.status_code == 201

        r = clinician_client.get("/outlab-consult-runs")
        assert r.status_code == 200
        assert any(run["id"] == created.json()["id"] for run in r.json())


class TestLifecycleWiring:
    def test_receive_and_update_tracking(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            "/outlab-consult-runs",
            json={
                "destination_lab": "Reference Lab A",
                "cases": [{"case_type": "surgical", "case_id": case.id}],
            },
        ).json()

        tracked = pathologist_client.patch(
            f"/outlab-consult-runs/{created['id']}/tracking", json={"tracking_number": "TRACK-123"}
        )
        assert tracked.status_code == 200
        assert tracked.json()["tracking_number"] == "TRACK-123"

        received = pathologist_client.patch(f"/outlab-consult-runs/{created['id']}/receive")
        assert received.status_code == 200
        assert received.json()["status"] == "received"

    def test_return_block(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            "/outlab-consult-runs",
            json={
                "destination_lab": "Reference Lab A",
                "cases": [{"case_type": "surgical", "case_id": case.id}],
            },
        ).json()
        detail_id = created["details"][0]["id"]

        r = pathologist_client.patch(f"/outlab-consult-runs/details/{detail_id}/return-block")

        assert r.status_code == 200
        assert r.json()["block_returned"] is True

    def test_delete_run(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_case(db, registrar_id=registrar.id)
        created = pathologist_client.post(
            "/outlab-consult-runs",
            json={
                "destination_lab": "Reference Lab A",
                "cases": [{"case_type": "surgical", "case_id": case.id}],
            },
        ).json()

        r = pathologist_client.delete(f"/outlab-consult-runs/{created['id']}")

        assert r.status_code == 204


class TestRegistrationInfo:
    """GET /registration-info/{case_type}/{case_id} — the copy-to-register
    bundle the Out-Lab Consult page shows when you click into a case."""

    def test_requires_authentication(self, client):
        assert client.get("/outlab-consult-runs/registration-info/surgical/1").status_code == 401

    def test_surgical_returns_patient_request_and_block_details(
        self, db, pathologist_client, admin_user
    ):
        from datetime import date, datetime

        from app.models.organization import Title
        from tests.factories import (
            make_anatomical_pathology_test,
            make_block,
            make_block_stain,
            make_patient,
            make_signable_case,
        )

        title = Title(title="นาย")
        db.add(title)
        db.commit()

        patient = make_patient(db, name="สมชาย")
        patient.ln = "ใจดี"
        patient.cid = f"1{uuid.uuid4().int % 10**12:012d}"
        patient.gender = "M"
        patient.birth_date = date(1980, 5, 1)
        patient.title_id = title.id
        db.commit()

        registrar, _ = admin_user
        case, specimen = make_signable_case(db, registrar_id=registrar.id, patient=patient)
        case.hn = "HN-9001"
        case.clinician_name = "นพ. ผู้ส่งตรวจ"
        case.collect_at = datetime(2026, 8, 1, 9, 30)
        case.clinical_diagnosis = "R/O adenocarcinoma"
        case.consult_reason = "Second opinion"
        db.commit()

        block = make_block(db, specimen_id=specimen.id, block_no=1)
        test = make_anatomical_pathology_test(db, category="Special Stain", name="PAS")
        make_block_stain(db, block_id=block.id, test_id=test.id, slide_no=2)

        r = pathologist_client.get(f"/outlab-consult-runs/registration-info/surgical/{case.id}")

        assert r.status_code == 200
        body = r.json()
        assert body["patient_title"] == "นาย"
        assert body["patient_first_name"] == "สมชาย"
        assert body["patient_last_name"] == "ใจดี"
        assert body["patient_full_name"] == "นาย สมชาย ใจดี"
        assert body["cid"] == patient.cid
        assert body["hn"] == "HN-9001"
        assert body["clinician_name"] == "นพ. ผู้ส่งตรวจ"
        assert body["collect_at"].startswith("2026-08-01T09:30")
        assert body["clinical_diagnosis"] == "R/O adenocarcinoma"
        assert body["consult_reason"] == "Second opinion"
        assert body["block_count"] == 1
        assert body["slide_count"] == 1
        assert body["blocks"][0]["block_code"] == "A1"
        assert body["blocks"][0]["specimen_name"] == "Test Specimen"
        slide = body["blocks"][0]["slides"][0]
        assert slide["test_name"] == "PAS"
        assert slide["slide_label"] == "A1"
        assert slide["slide_no"] == 2

    def test_gyne_returns_case_level_slides(self, db, pathologist_client, admin_user):
        from app.models.gyne_cyto_stain import GyneCytologyStain
        from tests.factories import make_anatomical_pathology_test, make_bare_gyne_case

        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        case.clinician_name = "พญ. ส่งตรวจ"
        case.clinical_history = "Routine screening"
        db.commit()

        test = make_anatomical_pathology_test(db, category="Cytology", name="Pap stain")
        db.add(GyneCytologyStain(case_id=case.id, test_id=test.id, slide_no=1))
        db.commit()

        r = pathologist_client.get(f"/outlab-consult-runs/registration-info/gyne/{case.id}")

        assert r.status_code == 200
        body = r.json()
        assert body["case_type"] == "gyne"
        assert body["clinician_name"] == "พญ. ส่งตรวจ"
        assert body["clinical_history"] == "Routine screening"
        assert body["specimen_type"] == "Conventional"
        assert body["blocks"] == []
        assert body["block_count"] == 0
        assert body["slide_count"] == 1
        assert body["slides"][0]["test_name"] == "Pap stain"
        assert body["slides"][0]["slide_label"] == case.accession_no

    def test_unknown_case_type_is_rejected(self, pathologist_client):
        r = pathologist_client.get("/outlab-consult-runs/registration-info/mystery/1")
        assert r.status_code == 400

    def test_missing_case_is_404(self, pathologist_client):
        r = pathologist_client.get("/outlab-consult-runs/registration-info/surgical/99999999")
        assert r.status_code == 404
