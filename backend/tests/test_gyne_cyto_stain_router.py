"""Router-level tests for app/routers/gyne_cyto_stain.py. The crud layer
(app/crud/gyne_cyto_stain.py) already has thorough business-logic coverage
in test_gyne_cyto_stain.py — this focuses on router wiring, 404s, and the
print-stickers PDF generation.

REGRESSION TEST for a real fix: unlike every other stain/image router in
this codebase, `router = APIRouter(prefix="/gyne-stains", ...)` used to
declare NO `dependencies=` at all, and most of its endpoints
(registered-queue, pending-print, case listing, create, update, runs
listing) took no `current_user` param either — reachable with ZERO
authentication. Fixed by adding `dependencies=[Depends(get_current_user)]`
at the router level, matching the "any authenticated user" bar
`POST /runs`/`GET /runs/{run_id}/print-stickers` already required."""

from tests.factories import (
    make_bare_gyne_case,
    make_anatomical_pathology_test,
    make_system_setting,
    make_hospital,
)


class TestNowRequireAuthentication:
    """See module docstring — these previously had zero auth."""

    def test_registered_queue_requires_authentication(self, client):
        assert client.get("/gyne-stains/registered-queue").status_code == 401

    def test_pending_print_requires_authentication(self, client):
        assert client.get("/gyne-stains/pending-print").status_code == 401

    def test_runs_listing_requires_authentication(self, client):
        assert client.get("/gyne-stains/runs").status_code == 401

    def test_create_stain_requires_authentication(self, client):
        r = client.post("/gyne-stains", json={"case_id": 1, "test_id": 1, "slide_no": 1})
        assert r.status_code == 401

    def test_pathologist_can_reach_all_of_the_above(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)

        assert pathologist_client.get("/gyne-stains/registered-queue").status_code == 200
        assert pathologist_client.get("/gyne-stains/pending-print").status_code == 200
        assert pathologist_client.get("/gyne-stains/runs").status_code == 200

        r = pathologist_client.post(
            "/gyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        )
        assert r.status_code == 200


class TestCrudWiring:
    def test_create_and_read_by_case(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)

        created = pathologist_client.post(
            "/gyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        ).json()

        r = pathologist_client.get(f"/gyne-stains/case/{case.id}")
        assert r.status_code == 200
        assert any(s["id"] == created["id"] for s in r.json())

    def test_update_missing_stain_returns_404(self, pathologist_client):
        r = pathologist_client.patch("/gyne-stains/999999", json={"status": "stained"})
        assert r.status_code == 404

    def test_update_existing_stain(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        created = pathologist_client.post(
            "/gyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        ).json()

        r = pathologist_client.patch(f"/gyne-stains/{created['id']}", json={"status": "stained"})

        assert r.status_code == 200
        assert r.json()["status"] == "stained"


class TestCreateRunAndPrintStickers:
    def test_create_run_requires_authentication(self, client):
        r = client.post("/gyne-stains/runs", json={"stainer_id": "ST-1", "stain_ids": [1]})
        assert r.status_code == 401

    def test_create_run_with_no_stain_ids_returns_400(self, pathologist_client):
        r = pathologist_client.post("/gyne-stains/runs", json={"stainer_id": "ST-1", "stain_ids": []})
        assert r.status_code == 400

    def test_print_stickers_generates_a_pdf(self, db, pathologist_client, admin_user):
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id)
        ap_test = make_anatomical_pathology_test(db)
        make_system_setting(db)
        stain = pathologist_client.post(
            "/gyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        ).json()
        run = pathologist_client.post(
            "/gyne-stains/runs", json={"stainer_id": "ST-1", "stain_ids": [stain["id"]], "run_name": "RUN-GYNE-1"}
        ).json()

        r = pathologist_client.get(f"/gyne-stains/runs/{run['id']}/print-stickers")

        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"

    def test_print_stickers_missing_run_returns_404(self, pathologist_client):
        assert pathologist_client.get("/gyne-stains/runs/999999/print-stickers").status_code == 404

    def test_sticker_uses_hospital_short_name_when_overridden(self, db, pathologist_client, admin_user, monkeypatch):
        make_system_setting(db, lab_short_name_en="MASTER-LAB")
        hospital = make_hospital(db)
        hospital.use_custom_report_header = True
        hospital.report_short_name_en = "HOSP-B"
        db.commit()
        registrar, _ = admin_user
        case = make_bare_gyne_case(db, registrar_id=registrar.id, hospital=hospital)
        ap_test = make_anatomical_pathology_test(db)
        stain = pathologist_client.post(
            "/gyne-stains", json={"case_id": case.id, "test_id": ap_test.id, "slide_no": 1}
        ).json()
        run = pathologist_client.post(
            "/gyne-stains/runs", json={"stainer_id": "ST-1", "stain_ids": [stain["id"]], "run_name": "RUN-GYNE-HOSP"}
        ).json()

        captured = {}

        def fake_generate(print_data, **kwargs):
            captured["print_data"] = print_data
            return b"%PDF-fake"

        import app.routers.gyne_cyto_stain as router_module
        monkeypatch.setattr(router_module, "generate_slide_sticker_pdf", fake_generate)

        r = pathologist_client.get(f"/gyne-stains/runs/{run['id']}/print-stickers")

        assert r.status_code == 200
        assert captured["print_data"][0]["hospital_code"] == "HOSP-B"
