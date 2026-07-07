"""Router-level tests for app/routers/nongyne_cyto_stain.py. Mirrors
test_gyne_cyto_stain_router.py exactly, including the same fix for "no
authentication at all on most endpoints" — see that file's module
docstring for the full rationale (confirmed independently below for this
router too, since it's a separate APIRouter instance, not shared code)."""

from tests.factories import (
    make_bare_nongyne_case,
    make_anatomical_pathology_test,
    make_system_setting,
    make_hospital,
)


class TestNowRequireAuthentication:
    def test_registered_queue_requires_authentication(self, client):
        assert client.get("/nongyne-stains/registered-queue").status_code == 401

    def test_pending_print_requires_authentication(self, client):
        assert client.get("/nongyne-stains/pending-print").status_code == 401

    def test_runs_listing_requires_authentication(self, client):
        assert client.get("/nongyne-stains/runs").status_code == 401

    def test_create_stain_requires_authentication(self, client):
        r = client.post("/nongyne-stains", json={"case_id": 1, "test_id": 1, "slide_no": 1})
        assert r.status_code == 401

    def test_pathologist_can_reach_all_of_the_above(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)

        assert pathologist_client.get("/nongyne-stains/registered-queue").status_code == 200
        assert pathologist_client.get("/nongyne-stains/pending-print").status_code == 200
        assert pathologist_client.get("/nongyne-stains/runs").status_code == 200

        r = pathologist_client.post(
            "/nongyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        )
        assert r.status_code == 200


class TestCrudWiring:
    def test_create_and_read_by_case(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)

        created = pathologist_client.post(
            "/nongyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        ).json()

        r = pathologist_client.get(f"/nongyne-stains/case/{case.id}")
        assert r.status_code == 200
        assert any(s["id"] == created["id"] for s in r.json())

    def test_update_missing_stain_returns_404(self, pathologist_client):
        r = pathologist_client.patch("/nongyne-stains/999999", json={"status": "stained"})
        assert r.status_code == 404

    def test_update_existing_stain(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        created = pathologist_client.post(
            "/nongyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        ).json()

        r = pathologist_client.patch(f"/nongyne-stains/{created['id']}", json={"status": "stained"})

        assert r.status_code == 200
        assert r.json()["status"] == "stained"


class TestCreateRunAndPrintStickers:
    def test_create_run_requires_authentication(self, client):
        r = client.post("/nongyne-stains/runs", json={"stainer_id": "ST-1", "stain_ids": [1]})
        assert r.status_code == 401

    def test_create_run_with_no_stain_ids_returns_400(self, pathologist_client):
        r = pathologist_client.post("/nongyne-stains/runs", json={"stainer_id": "ST-1", "stain_ids": []})
        assert r.status_code == 400

    def test_print_stickers_generates_a_pdf(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        make_system_setting(db)
        stain = pathologist_client.post(
            "/nongyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        ).json()
        run = pathologist_client.post(
            "/nongyne-stains/runs", json={"stainer_id": "ST-1", "stain_ids": [stain["id"]], "run_name": "RUN-NONGYNE-1"}
        ).json()

        r = pathologist_client.get(f"/nongyne-stains/runs/{run['id']}/print-stickers")

        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"

    def test_print_stickers_missing_run_returns_404(self, pathologist_client):
        assert pathologist_client.get("/nongyne-stains/runs/999999/print-stickers").status_code == 404

    def test_sticker_uses_hospital_short_name_when_overridden(self, db, pathologist_client, admin_user, monkeypatch):
        make_system_setting(db, lab_short_name_en="MASTER-LAB")
        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.report_short_name_en = "HOSP-B"
        db.commit()
        registrar, _ = admin_user
        case = make_bare_nongyne_case(db, registrar_id=registrar.id, hospital=hospital)
        ap_test = make_anatomical_pathology_test(db)
        stain = pathologist_client.post(
            "/nongyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        ).json()
        run = pathologist_client.post(
            "/nongyne-stains/runs", json={"stainer_id": "ST-1", "stain_ids": [stain["id"]], "run_name": "RUN-NONGYNE-HOSP"}
        ).json()

        captured = {}

        def fake_generate(print_data, **kwargs):
            captured["print_data"] = print_data
            return b"%PDF-fake"

        import app.routers.nongyne_cyto_stain as router_module
        monkeypatch.setattr(router_module, "generate_slide_sticker_pdf", fake_generate)

        r = pathologist_client.get(f"/nongyne-stains/runs/{run['id']}/print-stickers")

        assert r.status_code == 200
        assert captured["print_data"][0]["hospital_code"] == "HOSP-B"
